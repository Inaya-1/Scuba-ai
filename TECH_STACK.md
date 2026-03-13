# Scuba.ai Technical Stack & Architecture

This document summarizes the **current implementation** of Scuba.ai across frontend, backend, infrastructure, and deployment.

## 1) Project Snapshot

Scuba.ai is a multimodal dive assistant web app designed for a hackathon “Wizard of Oz” demo:

- Live camera frame analysis
- Demo video frame analysis (cached MP4 or direct URL)
- Dive map upload + cached map selection
- AI safety/species/navigation responses over WebSocket

---

## 2) Current Architecture (End-to-End)

### High-level flow

1. User starts on a landing page (`frontend/src/components/LandingPage.jsx`)
2. User enters dive mode with either:
   - `camera` source (`CameraFeed.jsx`)
   - `video` source (`VideoSource.jsx`)
3. Frontend captures frames (JPEG base64) and sends over WebSocket to `/ws`
4. Backend (`FastAPI`) routes messages by type:
   - `frame` -> `handle_frame(...)`
   - `map_upload` -> `handle_map_upload(...)`
5. Backend calls Gemini model and returns normalized JSON (`AgentOutput`)
6. Frontend renders overlay/hazard UI (`ResponseOverlay.jsx`, `HazardBanner.jsx`)

### Message contract

- Inbound: `{ type, payload, metadata }`
- Supported message types:
  - `frame`
  - `map_upload`
- Outbound modeled by `AgentOutput`:
  - `agent`: `safety | bio | nav | manager`
  - `type`: `info | hazard | species | navigation`
  - `content`, `priority`, `metadata`

---

## 3) Frontend Stack

### Core framework/tooling

- **React** `^19.2.4`
- **Vite** `^7.3.1`
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- **framer-motion** `^12.36.0` (animations)
- **lucide-react** `^0.577.0` (icons)
- ESLint 9 + React hooks/reload plugins

### Frontend structure

- Entry:
  - `frontend/src/main.jsx`
  - `frontend/src/App.jsx`
- Main UI components:
  - `LandingPage.jsx`
  - `CameraFeed.jsx`
  - `VideoSource.jsx`
  - `StatusBar.jsx`
  - `ResponseOverlay.jsx`
  - `HazardBanner.jsx`
  - `DiveMapGallery.jsx`

### Frontend behavior

- Landing page is the default route state.
- Dive mode initializes WebSocket connection and frame streaming.
- WebSocket URL is protocol-aware:
  - `wss://.../ws` on HTTPS
  - `ws://.../ws` on HTTP
- Auto-reconnect logic is implemented on socket close.
- Dive maps support:
  - Cached maps (`/maps/*.jpg`) via `fetch` + `FileReader`
  - Manual upload (camera/file input)
- Demo footage support:
  - Cached MP4s from `/demo/*.mp4`
  - Custom direct MP4 URL input
  - Note: YouTube URLs cannot be frame-captured directly due to browser/CORS restrictions.

---

## 4) Backend Stack

### Runtime and package management

- **Python** `>=3.11`
- **uv** for dependency management and execution
- `pyproject.toml` + `uv.lock`
- `requirements.txt` still present (legacy parity), but uv is primary.

### Backend dependencies

- `fastapi`
- `uvicorn[standard]`
- `python-dotenv`
- `pydantic`
- `google-genai`

### Backend modules

- `backend/app/main.py`
  - FastAPI app, CORS, `/health`, `/ws`
  - Static file serving for bundled frontend (if `static/` exists)
  - SPA catch-all route
- `backend/app/ws_handler.py`
  - Gemini client singleton
  - `handle_frame` (vision analysis)
  - `handle_map_upload` (navigation/map analysis)
- `backend/app/prompts/system.py`
  - Primary system prompt enforcing strict JSON outputs
- `backend/app/models/messages.py`
  - Pydantic input/output schemas
- `backend/app/config.py`
  - environment variable loading

---

## 5) AI Integration

- Provider: Google Gemini via `google-genai`
- Model currently used in handlers: `gemini-2.0-flash`
- Payload mode: inline image data (base64 JPEG)
- Output parsing:
  - markdown fence stripping
  - JSON decode
  - Pydantic validation (`AgentOutput`)

---

## 6) Static Assets & Demo Data

- `frontend/public/demo/`
  - expected files: `reef-dive.mp4`, `wreck-dive.mp4`, `night-dive.mp4`
- `frontend/public/maps/`
  - expected files: `reef-cove.jpg`, `blue-hole.jpg`, `wreck-site.jpg`

These are copied into production static hosting when frontend is built and bundled.

---

## 7) Deployment Target: Google App Engine

### Current deployment configuration

- `app.yaml`:
  - `runtime: custom`
  - `env: flex` (**required for WebSockets**)
  - health checks on `/health`
  - autoscaling + resource settings
- `Dockerfile`:
  - base: `python:3.11-slim`
  - installs `uv`
  - syncs backend deps with lockfile
  - copies backend app + frontend built files into `/app/static`
  - runs `uv run uvicorn app.main:app --host 0.0.0.0 --port 8080`

### Recommended App Engine-compatible pattern (current direction)

- **Single service/container**:
  - FastAPI serves both:
    - backend API/WebSocket
    - frontend static SPA
- Reason:
  - simpler deployment
  - no cross-service CORS/WebSocket routing complexity
  - cleaner App Engine Flex setup

---

## 8) Environment Variables

From `backend/.env` / `.env.example`:

- `GEMINI_API_KEY`
- `GOOGLE_CLOUD_PROJECT`

Current example values are placeholders and must be replaced before production deployment.

---

## 9) Local Development Workflow

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend (uv-first)

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

### Build frontend bundle

```bash
cd frontend
npm run build
```

### Container deploy prep

Ensure built frontend assets are available to Docker build context (currently copied from `frontend/dist`).

---

## 10) Known Gaps / Next Technical Priorities

1. **Audio loop not implemented yet**
   - no mic streaming to backend
   - no synthesized voice playback response path
2. **Agent specialization still monolithic**
   - response schema supports multi-agent, but orchestration is not yet split into dedicated safety/bio/nav workers
3. **Persistence layer not implemented**
   - no Firestore/session history yet
4. **Operational hardening pending**
   - tighter env validation
   - structured observability/metrics
   - request throttling and Gemini quota controls

---

## 11) File References

- Frontend root: `frontend/`
- Backend root: `backend/`
- Main backend app: `backend/app/main.py`
- Frontend app entry: `frontend/src/App.jsx`
- Deploy config: `Dockerfile`, `app.yaml`

