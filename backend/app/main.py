import json
import logging
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.ws_handler import route_message
from app.config import GEMINI_API_KEY
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


@app.get("/api/token")
async def get_token():
    """Serve the Gemini API key to authenticated frontend clients.
    In production, gate this behind auth (session cookie, JWT, etc.)."""
    return {"apiKey": GEMINI_API_KEY}


@app.get("/api/species-log")
async def species_log():
    """Return all species identified this session."""
    return {"species": get_species_log()}


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
