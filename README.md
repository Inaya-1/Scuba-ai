# 🤿 Scuba.ai

**The world's first multimodal AI diving buddy** — real-time computer-vision safety monitoring, marine species identification, underwater navigation, and conversational voice interaction, powered by Google Gemini.

🌐 **Live App:** [scuba-ai.uc.r.appspot.com](https://scuba-ai.uc.r.appspot.com/)
🏆 **Hackathon:** [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) — [Project Page](https://devpost.com/software/scuba-ai/)

![Live AI](https://img.shields.io/badge/Gemini_Live-Native_Audio-4285F4?logo=google&logoColor=white)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/Frontend-React_19-61DAFB?logo=react&logoColor=black)
![Deploy](https://img.shields.io/badge/Deploy-App_Engine_Flex-4285F4?logo=googlecloud&logoColor=white)

---
<iframe width="560" height="315" src="https://www.youtube.com/embed/QBh5830G_LY" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
---

## 🎯 What It Does

Scuba.ai turns any waterproof phone or dive housing into an intelligent dive computer. It captures live camera frames underwater, runs them through **three specialized AI agents** in parallel, and returns prioritized guidance overlaid on a heads-up display. The diver can also **speak directly to Scoobi** (the AI buddy) via always-on voice for hands-free interaction.

### Demo

> 🎬 **[Watch the demo video](demo.mov)**

---

## ✨ Features

### 🛡️ Safety & Health Agent
- **Gauge OCR** — zero-shot reading of analog SPGs, depth gauges, dive computers, and watches via Gemini Vision
- **8 threshold categories** — air supply, depth, ascent/descent rate, temperature, CNS%, PO₂, NDL, safety stops
- **3-tier severity alerts** — CRITICAL → WARNING → INFO with full-screen hazard overlays for life-threatening conditions
- **Trend detection** — caches readings to calculate real-time ascent/descent rates (~6s intervals)

### 🐠 Marine Biology Agent
- **Active ID** — tap "Identify" or point at a creature to get instant species classification
- **Passive scanning** — background monitoring flags dangerous species (lionfish, fire coral, jellyfish) automatically
- **Safety classification** — every species tagged safe / caution / dangerous with appropriate advice
- **Dedup & frame-aware cooldown** — won't spam the same fish; detects scene changes before re-identifying

### 🧭 Navigation Agent
- **Map upload** — photograph a hand-drawn dive site map; AI extracts landmarks, entry/exit points, and route with compass bearings
- **Live correlation** — camera frames matched against cached map landmarks for real-time course corrections
- **Heading integration** — device compass data informs turn-by-turn navigation guidance

### 🎙️ Gemini Live Voice Interface
- **Always-on mic** — continuous 16kHz PCM audio streamed to Gemini Live API (no push-to-talk required)
- **Voice-controlled settings** — activate features by speaking: *"upload a map"*, *"switch to marine biologist mode"*, *"identify that fish"*
- **Function calling** — 6 registered tools (toggle_mode, toggle_auto_identify, toggle_agent_cards, open_map, identify_now, identify_pointed)
- **Priority-based narration** — Gemini triages incoming agent reports and speaks only what matters

### 📊 Heads-Up Display
- **Glass-morphism HUD** — depth, air pressure, compass, temperature, bottom time — all animated and color-coded
- **Agent cards** — up to 3 simultaneous messages with priority-based styling
- **Dual UI modes** — *Diver* (minimal, safety-focused) and *Marine Biologist* (detailed species cards)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   DIVER'S DEVICE                     │
│                                                      │
│   📷 Camera ──┐    🎤 Mic ──┐    🧭 Compass ──┐     │
│               │             │                 │     │
│   ┌───────────▼─────────────▼─────────────────▼──┐  │
│   │           REACT FRONTEND (Vite + TS)         │  │
│   │                                              │  │
│   │  CameraFeed → HUD → ResponseOverlay         │  │
│   │                                              │  │
│   │  ScubaSocket (WS)     GeminiLive (Bidi WS)   │  │
│   │  └→ frames every 6s   └→ audio + video 2s    │  │
│   └──────┬───────────────────────┬───────────────┘  │
└──────────┼───────────────────────┼──────────────────┘
           │                       │
           ▼                       ▼
┌──────────────────┐   ┌─────────────────────────────┐
│  FASTAPI BACKEND │   │  GEMINI LIVE API             │
│                  │   │  (native-audio-preview)      │
│  Safety Agent ─┐ │   │                              │
│  Bio Agent    ─┤ │   │  • Voice input/output        │
│  Nav Agent    ─┘ │   │  • Function calling (tools)  │
│                  │   │  • Agent report triage        │
│  → Structured    │   │  • Priority narration         │
│    JSON output   │   │                              │
└──────────────────┘   └──────────────────────────────┘
```

**Dual pipeline design:**
- **Backend agents** (every 6s) — structured JSON analysis via `gemini-2.5-flash` for safety, bio, and navigation
- **Gemini Live** (always-on) — real-time bidirectional audio/video via `gemini-2.5-flash-native-audio` for voice interaction and agent report narration

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- A [Google AI API key](https://aistudio.google.com/apikey)
- (Optional) [ElevenLabs API key](https://elevenlabs.io/) for TTS

### 1. Clone & Install

```bash
git clone https://github.com/Inaya-1/Scuba-ai.git
cd Scuba-ai

# Backend
cd backend
uv sync
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### 2. Configure Environment

Create `backend/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_key_here  # optional
```

### 3. Run Locally

```bash
# Terminal 1 — Backend
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open **http://localhost:3000** → enter access code `scuba2025` → start diving!

---

## 🌐 Deployment (Google App Engine)

The app deploys as a single container on App Engine Flex (required for WebSocket support).

```bash
# Create app.yaml with your keys (gitignored)
cat > app.yaml << 'EOF'
runtime: custom
env: flex
resources:
  cpu: 1
  memory_gb: 0.5
  disk_size_gb: 10
automatic_scaling:
  min_num_instances: 1
  max_num_instances: 3
env_variables:
  GEMINI_API_KEY: "your_key"
  ELEVENLABS_API_KEY: "your_key"
  ACCESS_CODE: "scuba2025"
liveness_check:
  path: /health
readiness_check:
  path: /health
EOF

# Deploy
gcloud app deploy app.yaml
```

---

## 📁 Project Structure

```
Scuba-ai/
├── frontend/
│   ├── src/
│   │   ├── components/       # React UI components
│   │   │   ├── CameraFeed    # Camera capture + frame extraction
│   │   │   ├── HUD           # Heads-up display overlay
│   │   │   ├── MapUpload     # Dive map upload + analysis
│   │   │   ├── RouteOverlay  # Navigation route display
│   │   │   ├── DiveSetup     # Pre-dive configuration
│   │   │   └── AdminConsole  # Settings panel
│   │   ├── services/
│   │   │   ├── liveApi.ts    # Gemini Live API client
│   │   │   ├── backendSocket # Backend WebSocket client
│   │   │   ├── audioCapture  # Mic → PCM audio capture
│   │   │   └── ttsService    # ElevenLabs TTS queue
│   │   └── App.tsx           # Main app + state management
│   └── public/
│       └── pcm-worklet.js    # AudioWorklet processor
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── base.py       # Shared Gemini call helper
│   │   │   ├── safety.py     # Gauge OCR + threshold checks
│   │   │   ├── bio.py        # Species identification
│   │   │   └── nav.py        # Map analysis + navigation
│   │   ├── prompts/          # Agent system prompts
│   │   ├── models/           # Pydantic data models
│   │   ├── main.py           # FastAPI app + WebSocket
│   │   ├── ws_handler.py     # Message router
│   │   └── config.py         # Environment config
│   └── pyproject.toml
├── Dockerfile                # Multi-stage build
├── app.yaml                  # App Engine config (gitignored)
├── CLAUDE.md                 # AI assistant project context
└── docs/                    # Architecture, persona, tech stack docs
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4 |
| Animations | Motion (Framer Motion) |
| Icons | Lucide React |
| Backend | FastAPI, Uvicorn, Pydantic |
| AI Models | Gemini 2.5 Flash, Gemini 2.5 Flash Native Audio |
| Voice | Gemini Live API (bidirectional audio), ElevenLabs TTS |
| Audio | Web Audio API + AudioWorklet (16kHz PCM) |
| Deploy | Google App Engine Flex, Docker, Cloud Build |
| Package Mgmt | npm (frontend), uv (backend) |

---

## 👥 Team

Built by the Scuba.ai team for the Gemini Live Agent Challenge.

---

## 📄 License

This project was built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/).
