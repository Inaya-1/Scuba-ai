# Scuba.ai — Project Description

> **The world's first multimodal AI diving buddy.**
> Real-time computer-vision safety monitoring, marine species identification, and underwater navigation — powered by Google Gemini.

---

## Overview

Scuba.ai is a hackathon-born web application that turns any waterproof phone or dive housing into an intelligent dive computer. It uses **dual AI pipelines** — a structured backend agent system and a real-time Gemini Live voice stream — to keep divers informed, safe, and engaged throughout every dive.

The system captures live camera frames underwater, runs them through three specialized AI agents in parallel (Safety, Bio, Navigation), and returns prioritized guidance overlaid on a heads-up display. Divers can also speak to Scoobi, the AI buddy, via push-to-talk for conversational interaction.

---

## Features & Functionality

### 🛡️ Health Metrics Safety Agent
- **Gauge OCR**: Zero-shot reading of analog SPGs, depth gauges, dive computers, console clusters, and dive watches using Gemini Vision
- **8 Threshold Categories**: Air supply, depth, ascent/descent rate, water temperature, CNS%, PO₂, NDL, and safety stop monitoring
- **Severity-Ranked Alerts**: Three-tier system (CRITICAL → WARNING → INFO) ensures the most dangerous condition always surfaces first
- **Trend Detection**: Caches previous readings to calculate ascent/descent rates in real time (~6-second intervals)
- **Defense in Depth**: Hard-coded threshold checks run *after* Gemini returns readings — the model suggests, the code enforces

### 🐠 Marine Species Identification
- **Active ID**: Diver taps "Identify" to get instant species classification with common name, scientific name, safety level, and a fun fact
- **Passive Scanning**: Background monitoring flags dangerous species (lionfish, fire coral, jellyfish) automatically
- **Safety Classification**: Every species tagged as safe / caution / dangerous with appropriate advice and minimum distance

### 🧭 Underwater Navigation
- **Map Upload**: Photograph a hand-drawn dive site map; the AI extracts landmarks, entry/exit points, and a suggested route with compass bearings
- **Live Correlation**: Subsequent camera frames are matched against cached map landmarks for real-time course corrections
- **Heading Integration**: Compass metadata from the device informs navigation suggestions

### 🎙️ Conversational Voice Interface
- **Gemini Live API**: Persistent real-time session with voice model "Zephyr" for natural spoken interaction
- **Push-to-Talk**: Hold-to-speak microphone capture streamed as 16kHz PCM audio chunks
- **Audio Responses**: AI speaks back through the device — no screen reading required underwater

### 📊 Heads-Up Display
- **Glass-morphism HUD**: Depth, air pressure, compass heading, water temperature, bottom time — all animated and color-coded
- **Response Overlay**: Up to 3 agent messages displayed with priority-based styling (red for critical, orange for warnings, cyan for info)
- **Hazard Alerts**: Full-screen overlay for life-threatening conditions (CRITICAL priority)

---

## Technologies Used

### Backend
| Technology | Purpose |
|-----------|---------|
| **Python 3.11+** | Runtime |
| **FastAPI** | Async web framework + WebSocket server |
| **Uvicorn** | ASGI server |
| **Google Gemini** (`gemini-2.0-flash`) | Multimodal vision + language model |
| **google-genai SDK** | Python client for Gemini API |
| **Pydantic v2** | Data validation and serialization |
| **python-dotenv** | Secure environment configuration |

### Frontend
| Technology | Purpose |
|-----------|---------|
| **React 19** + **TypeScript 5.8** | UI framework |
| **Vite 6** | Build tooling + hot module replacement |
| **Tailwind CSS v4** | Utility-first styling |
| **Motion** (Framer Motion) | Fluid animations for HUD and alerts |
| **@google/genai** | Gemini Live API client (voice + vision) |
| **lucide-react** | Iconography |

### Infrastructure
| Technology | Purpose |
|-----------|---------|
| **Google App Engine (Flex)** | Production hosting with WebSocket support |
| **Docker** | Containerized deployment |
| **GitHub Actions** | CI/CD pipeline |

---

## Data Sources

| Source | Usage |
|--------|-------|
| **Live Camera Feed** | Primary input — frames extracted every 2 seconds as JPEG (quality 0.7), sent to all agents |
| **Dive Gauge Photos** | SPG, depth gauge, dive computer displays → OCR'd by Gemini for numeric readings |
| **Hand-Drawn Maps** | Photographed dive site maps parsed for landmarks, routes, and compass bearings |
| **Device Microphone** | Push-to-talk audio streamed to Gemini Live for conversational interaction |
| **Device Compass** | Heading metadata (0–360°) used for navigation agent context |
| **Gemini 2.0 Flash** | All AI inference — vision analysis, species classification, gauge reading, voice interaction |

No external databases or third-party APIs beyond Google Gemini are used. All session state (species log, map cache, last gauge reading) is held in-memory on the backend for the duration of a dive.

---

## Findings & Learnings

### What Worked Well
1. **Dual-Pipeline Architecture**: Separating structured agent analysis (WebSocket → JSON) from conversational voice (Gemini Live) gave us the best of both worlds — deterministic safety enforcement *and* natural interaction.
2. **Defense-in-Depth Safety**: Letting Gemini read the gauges but applying hard-coded thresholds afterward proved essential. The model occasionally misreads values; the code catches impossible readings before they reach the diver.
3. **Parallel Agent Execution**: Running Safety, Bio, and Nav agents simultaneously with `asyncio.gather()` keeps latency low even when all three have work to do. Priority-based result selection ensures the most important finding surfaces.
4. **Zero-Shot Gauge OCR**: Gemini 2.0 Flash handles analog gauge reading surprisingly well with detailed prompting — specifying needle position, scale markings, and unit conversion in the system prompt dramatically improved accuracy.
5. **Severity Ranking**: When multiple alerts fire simultaneously (e.g., low air + deep depth + fast ascent), sorting by severity ensures the diver sees the most critical issue first. This was a bug we caught during testing — originally the first alert in the list was returned, which could be a minor warning masking a critical hazard.

### Challenges & Solutions
1. **Free-Tier Rate Limits**: Gemini free tier has a daily request cap (resets at midnight PT). During development, we exhausted it quickly. Solution: mock testing with synthetic dive scenarios (21 threshold tests + 7 realistic dive scenarios) to validate offline.
2. **Synchronous Gemini Calls**: The `base.py` shared helper uses synchronous `generate_content()` inside an async FastAPI handler. This blocks the event loop during inference. For a hackathon this is acceptable; production would need `asyncio.to_thread()` or the async Gemini client.
3. **Markdown in API Responses**: Gemini occasionally wraps JSON output in markdown code fences (` ```json ... ``` `). The base agent strips these before parsing — a small but critical detail.
4. **Ascent Rate Calculation**: Computing m/min from two depth readings 6 seconds apart amplifies noise. A single misread gauge can produce a phantom "rapid ascent" alert. Future work: smoothing over 3+ readings.
5. **Printed Photo Detection**: For hackathon demos, divers photograph printed gauge images. The safety prompt explicitly handles this — "If you see a printed photo of a gauge, read the printed values" — which prevents the model from reporting "no gauge visible."

### Key Metrics
- **Safety Agent**: 8 threshold categories, 20+ rules, 3 severity tiers
- **Test Coverage**: 21 unit tests (all threshold categories) + 7 realistic dive scenarios — all passing
- **Latency**: ~2-4 seconds per structured agent call (Gemini inference dominates)
- **Frame Rate**: 1 frame every 6 seconds to backend; every 2 seconds to Gemini Live

---

## Team

Built for the **Google Gemini Hackathon** by the Scuba.ai team.
