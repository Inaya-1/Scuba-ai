# Scuba.ai — System Architecture

> Visual representation of how Gemini connects to the backend agents, WebSocket layer, and React frontend.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DIVER'S DEVICE                                │
│                        (Waterproof Phone/Housing)                       │
│                                                                         │
│  ┌───────────────┐   ┌──────────────┐   ┌───────────────────────────┐  │
│  │  📷 Camera    │   │  🎤 Mic      │   │  🧭 Compass / Sensors    │  │
│  │  (Rear-facing)│   │  (Push-Talk) │   │  (Heading 0-360°)        │  │
│  └──────┬────────┘   └──────┬───────┘   └────────────┬──────────────┘  │
│         │ JPEG frames        │ PCM audio              │ metadata        │
│         │ every 2s           │ 16kHz chunks           │                 │
│         ▼                    ▼                        ▼                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    REACT FRONTEND (Vite + TS)                   │    │
│  │                                                                 │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │    │
│  │  │ CameraFeed  │  │ HUD Display  │  │ ResponseOverlay       │  │    │
│  │  │ (frame      │  │ (depth, air, │  │ (agent messages,      │  │    │
│  │  │  extraction)│  │  heading,    │  │  hazard alerts,       │  │    │
│  │  │             │  │  temp, time) │  │  species IDs)         │  │    │
│  │  └─────────────┘  └──────────────┘  └───────────────────────┘  │    │
│  │                                                                 │    │
│  │  ┌──────────────────────┐  ┌────────────────────────────────┐  │    │
│  │  │ ScubaSocket (WS)     │  │ GeminiLive (Real-Time API)     │  │    │
│  │  │ • sendFrame()        │  │ • sendRealtimeInput(image)     │  │    │
│  │  │ • sendGaugeRead()    │  │ • sendRealtimeInput(audio)     │  │    │
│  │  │ • sendMap()          │  │ • onText → ResponseOverlay     │  │    │
│  │  │ • sendIdentify()     │  │ • onAudio → Web Audio API      │  │    │
│  │  └──────────┬───────────┘  └──────────────┬─────────────────┘  │    │
│  │             │                              │                    │    │
│  └─────────────┼──────────────────────────────┼────────────────────┘    │
│                │                              │                         │
└────────────────┼──────────────────────────────┼─────────────────────────┘
                 │                              │
    ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ NETWORK ─ ─ ─ ─ ─ ─ ─┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                 │                              │
                 ▼                              ▼
┌────────────────────────────┐    ┌──────────────────────────────────────┐
│   FASTAPI BACKEND          │    │     GOOGLE GEMINI LIVE API           │
│   (Python + Uvicorn)       │    │     (gemini-2.0-flash-live-001)      │
│                            │    │                                      │
│  ┌──────────────────────┐  │    │  • Persistent session                │
│  │  /ws  WebSocket      │  │    │  • Image + audio input streams       │
│  │  Message Router      │  │    │  • Text + voice output               │
│  │  (ws_handler.py)     │  │    │  • Voice: "Zephyr" (calm, clear)     │
│  └──────────┬───────────┘  │    │  • System instruction: Scoobi        │
│             │               │    │    persona (safety-first, concise)   │
│     ┌───────┼────────┐     │    └──────────────────────────────────────┘
│     │       │        │     │
│     ▼       ▼        ▼     │
│  ┌──────┐┌──────┐┌──────┐ │    ┌──────────────────────────────────────┐
│  │SAFETY││ BIO  ││ NAV  │ │    │     GOOGLE GEMINI FLASH API          │
│  │AGENT ││AGENT ││AGENT │ │    │     (gemini-2.0-flash)               │
│  │      ││      ││      │ │◄──►│                                      │
│  │gauge ││species│|map   │ │    │  • Multimodal vision + language      │
│  │OCR + ││ID +  ││parse │ │    │  • JSON-structured responses         │
│  │thresh││safety││+route│ │    │  • System prompts per agent           │
│  │olds  ││level ││guide │ │    │  • ~2-4s inference latency            │
│  └──┬───┘└──┬───┘└──┬───┘ │    └──────────────────────────────────────┘
│     │       │       │      │
│     ▼       ▼       ▼      │
│  ┌──────────────────────┐  │
│  │  Priority Selector   │  │
│  │  (highest severity   │  │
│  │   or any hazard)     │  │
│  └──────────┬───────────┘  │
│             │               │
│  ┌──────────▼───────────┐  │
│  │  AgentOutput (JSON)  │  │
│  │  {agent, type,       │  │
│  │   content, priority, │  │
│  │   metadata}          │  │
│  └──────────────────────┘  │
│                            │
│  Endpoints:                │
│  • /ws     (WebSocket)     │
│  • /health (healthcheck)   │
│  • /api/token (Gemini key) │
└────────────────────────────┘
```

---

## Data Flow Diagram

```
                    STRUCTURED PIPELINE (Backend Agents)
                    ════════════════════════════════════

  Camera ──► Frame (JPEG) ──► WebSocket /ws ──► Message Router
              every 2s          every 6s            │
                                               ┌────┼────┐
                                               ▼    ▼    ▼
                                            Safety Bio  Nav
                                            Agent  Agent Agent
                                               │    │    │
                                               ▼    ▼    ▼
                                           ┌─────────────────┐
                                      Each │  Gemini Flash   │ Vision +
                                     agent │  generate_      │ Language
                                     calls │  content()      │ Model
                                           └─────────────────┘
                                               │    │    │
                                               ▼    ▼    ▼
                                           JSON Responses
                                               │    │    │
                                            Safety: apply thresholds
                                            Bio:    cache species
                                            Nav:    use cached map
                                               │    │    │
                                               └────┼────┘
                                                    ▼
                                           Priority Selection
                                           (CRITICAL > WARNING > INFO)
                                                    │
                                                    ▼
                                           AgentOutput → Frontend


                    REAL-TIME PIPELINE (Gemini Live)
                    ════════════════════════════════

  Camera ──► Frame ──────────────────────────► Gemini Live API
              every 2s                          (persistent session)
  Mic ────► PCM Audio ──────────────────────►       │
              (push-to-talk)                        │
                                                    ▼
                                              Text + Voice
                                              Responses
                                                    │
                                                    ▼
                                              Frontend renders text
                                              + plays audio via
                                              Web Audio API
```

---

## Agent Interaction Detail

```
┌─────────────────────────────────────────────────────────────────┐
│                     MESSAGE ROUTING TABLE                        │
├──────────────┬──────────────────────┬───────────────────────────┤
│ Message Type │ Agent(s) Called       │ Response                  │
├──────────────┼──────────────────────┼───────────────────────────┤
│ "frame"      │ Safety + Bio + Nav   │ Highest-priority result   │
│              │ (parallel)           │ or any hazard             │
├──────────────┼──────────────────────┼───────────────────────────┤
│ "gauge_read" │ Safety only          │ Gauge readings + alerts   │
├──────────────┼──────────────────────┼───────────────────────────┤
│ "identify"   │ Bio only             │ Species ID + safety info  │
├──────────────┼──────────────────────┼───────────────────────────┤
│ "map_upload" │ Nav only             │ Landmarks + route plan    │
├──────────────┼──────────────────────┼───────────────────────────┤
│ "nav_frame"  │ Nav only             │ Course correction         │
│              │ (requires map cache) │                           │
└──────────────┴──────────────────────┴───────────────────────────┘


┌──────────────────────────────────────────────────────────────────┐
│                    SESSION STATE (In-Memory)                      │
├────────────────┬─────────────────────────────────────────────────┤
│ Safety Agent   │ _last_reading: dict                             │
│                │   Caches previous gauge values for rate calc    │
├────────────────┼─────────────────────────────────────────────────┤
│ Bio Agent      │ _species_log: list                              │
│                │   All species identified this session           │
├────────────────┼─────────────────────────────────────────────────┤
│ Nav Agent      │ _cached_map: dict                               │
│                │   Parsed landmarks + route from uploaded map    │
└────────────────┴─────────────────────────────────────────────────┘
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────┐
│            Google App Engine (Flex)              │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │         Docker Container                   │  │
│  │                                           │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │  Uvicorn (ASGI Server, port 8080)   │  │  │
│  │  │                                     │  │  │
│  │  │  ┌───────────────────────────────┐  │  │  │
│  │  │  │  FastAPI Application          │  │  │  │
│  │  │  │  • /ws          (WebSocket)   │  │  │  │
│  │  │  │  • /health      (healthcheck) │  │  │  │
│  │  │  │  • /api/token   (Gemini key)  │  │  │  │
│  │  │  │  • /*           (static SPA)  │  │  │  │
│  │  │  └───────────────────────────────┘  │  │  │
│  │  │                                     │  │  │
│  │  │  /app/static/ ← React build (dist) │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  Auto-scaling: 1–10 instances                   │
│  Health check: GET /health every 10s            │
│  Env vars: GEMINI_API_KEY, GOOGLE_CLOUD_PROJECT │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│           Google Gemini API                      │
│                                                 │
│  • gemini-2.0-flash         (structured agents) │
│  • gemini-2.0-flash-live    (real-time voice)   │
└─────────────────────────────────────────────────┘
```
