import json
import logging
from pathlib import Path
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel
from app.ws_handler import route_message
from app.config import GEMINI_API_KEY, ACCESS_CODE, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
from app.agents.bio import get_species_log

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Scuba.ai Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the frontend static build when deployed (App Engine / Cloud Run)
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@app.get("/health")
async def health():
    return {"status": "ok"}


class AccessRequest(BaseModel):
    code: str


@app.post("/api/verify")
async def verify_access(req: AccessRequest):
    """Verify access code before allowing dive session."""
    if req.code == ACCESS_CODE:
        return {"valid": True}
    return {"valid": False}


@app.post("/api/token")
async def get_token(req: AccessRequest):
    """Serve the Gemini API key only after access code verification."""
    if req.code != ACCESS_CODE:
        return {"error": "Invalid access code"}
    return {"apiKey": GEMINI_API_KEY}


@app.get("/api/species-log")
async def species_log():
    """Return all species identified this session."""
    return {"species": get_species_log()}


class TTSRequest(BaseModel):
    text: str
    urgent: bool = False


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    """Proxy text to ElevenLabs TTS and return audio/mpeg bytes."""
    if not ELEVENLABS_API_KEY:
        return Response(status_code=503, content="ElevenLabs API key not configured")
    if len(req.text) > 200:
        return Response(status_code=400, content="Text exceeds 200 character limit")

    voice_settings = {
        "stability": 0.25 if req.urgent else 0.35,
        "similarity_boost": 0.75,
        "style": 0.6 if req.urgent else 0.45,
        "use_speaker_boost": True,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json={
                "text": req.text,
                "model_id": "eleven_flash_v2_5",
                "voice_settings": voice_settings,
                "output_format": "mp3_22050_32",
            },
        )
        if resp.status_code != 200:
            logger.error(f"ElevenLabs error {resp.status_code}: {resp.text}")
            return Response(status_code=502, content="TTS provider error")
        return Response(content=resp.content, media_type="audio/mpeg")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket client connected")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})
                continue

            msg_type = data.get("type")
            payload = data.get("payload", "")
            metadata = data.get("metadata", {})

            result = await route_message(msg_type, payload, metadata)
            await websocket.send_json(result)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


# Mount frontend static files last (catch-all for SPA routing)
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    # Serve static files in subdirectories (demo videos, maps, etc.)
    for subdir in ["demo", "maps"]:
        sub_path = STATIC_DIR / subdir
        if sub_path.is_dir():
            app.mount(f"/{subdir}", StaticFiles(directory=sub_path), name=subdir)

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve index.html for all non-API routes (SPA catch-all)."""
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
