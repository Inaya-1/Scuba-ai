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


class SimulateRequest(BaseModel):
    bar: float | None = None
    psi: float | None = None
    depth_m: float | None = None
    depth_ft: float | None = None
    temp_c: float | None = None
    ndl_min: float | None = None
    cns_percent: float | None = None
    po2: float | None = None
    ascent_rate_mpm: float | None = None


@app.post("/api/admin/simulate")
async def admin_simulate(req: SimulateRequest):
    """Simulate dive metrics for demo — bypasses Gemini, runs safety thresholds directly."""
    from app.agents.safety import _check_thresholds, _depth_history, _MAX_DEPTH_HISTORY
    from app.models.messages import AgentOutput
    import time

    # Build metadata from provided metrics
    m: dict = {}
    if req.bar is not None:
        m["bar"] = req.bar
        m["psi"] = round(req.bar * 14.504)
    elif req.psi is not None:
        m["psi"] = req.psi
        m["bar"] = round(req.psi / 14.504, 1)
    if req.depth_m is not None:
        m["depth_m"] = req.depth_m
        m["depth_ft"] = round(req.depth_m * 3.2808, 1)
    elif req.depth_ft is not None:
        m["depth_ft"] = req.depth_ft
        m["depth_m"] = round(req.depth_ft * 0.3048, 1)
    if req.temp_c is not None:
        m["temp_c"] = req.temp_c
    if req.ndl_min is not None:
        m["ndl_min"] = req.ndl_min
    if req.cns_percent is not None:
        m["cns_percent"] = req.cns_percent
    if req.po2 is not None:
        m["po2"] = req.po2

    # Inject simulated ascent rate via depth history manipulation
    if req.ascent_rate_mpm is not None and req.depth_m is not None:
        now = time.time()
        # Clear history and inject synthetic readings that produce the desired rate
        _depth_history.clear()
        for i in range(3):
            fake_depth = req.depth_m + req.ascent_rate_mpm * (2 - i) / 60 * 6
            _depth_history.append((fake_depth, now - (2 - i) * 6))

    # Build a baseline output and run thresholds
    base = AgentOutput(
        agent="safety",
        type="info",
        content="Simulated dive metrics received.",
        priority=3,
        metadata=m,
    )
    result = _check_thresholds(base)
    data = result.model_dump()

    # Generate tts_text — alert content is already in Scoobi's voice, just truncate for TTS
    alert_level = (data.get("metadata") or {}).get("alert_level")
    content = data.get("content", "")
    if alert_level in ("critical", "warning"):
        # Content is already Scoobi-voiced from _check_thresholds, truncate to 120 chars
        data["metadata"]["tts_text"] = content[:120]
    else:
        # Calm status readout
        parts = []
        if m.get("bar"):
            parts.append(f"Air's at {int(m['bar'])} bar")
        if m.get("depth_m"):
            parts.append(f"{m['depth_m']:.0f} meters deep")
        if m.get("temp_c"):
            parts.append(f"water's {m['temp_c']:.0f} degrees")
        if parts:
            data["metadata"]["tts_text"] = f"{', '.join(parts)}. Looking good."
        else:
            data["metadata"]["tts_text"] = "All good down here."
    # Also rewrite the content field for non-alert responses in Scoobi voice
    if not alert_level:
        parts = []
        if m.get("bar"):
            parts.append(f"air at {int(m['bar'])} bar")
        if m.get("depth_m"):
            parts.append(f"depth {m['depth_m']:.0f}m")
        if m.get("temp_c"):
            parts.append(f"water {m['temp_c']:.0f}°C")
        if m.get("ndl_min"):
            parts.append(f"NDL {int(m['ndl_min'])} min")
        data["content"] = f"Looking good — {', '.join(parts)}." if parts else "All systems normal. Enjoy the dive."

    # Map numeric priority to string
    p = data.get("priority", 3)
    if p >= 9:
        data["priority"] = "critical"
    elif p >= 6:
        data["priority"] = "high"
    elif p >= 3:
        data["priority"] = "medium"
    else:
        data["priority"] = "low"

    return data


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
            if result is not None:
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
