# Scuba.ai Project Context

## Project Overview
**Pitch:** Scuba.ai is a multimodal AI dive buddy housed in a waterproof smartphone case. It uses the phone's camera and microphone to keep divers safe, oriented, and educated in real-time. 
**Hackathon Category:** The Live Agent / The UI Navigator.
**Timeframe constraint:** 3 days remaining. Prioritize functional "Wizard of Oz" demo over production-ready perfection. Focus on the core visual/audio loop.

## Tech Stack
* **Frontend:** React (Web App) - optimized for mobile view. Needs to request and handle `getUserMedia` (Camera and Microphone).
* **Backend:** Python (FastAPI) server, targeted for deployment on Google Cloud Run.
* **AI / Brain:** Gemini 1.5 Pro API (specifically utilizing multimodal Vision and Audio streams).

## Core Features & AI Implementation Strategy
1.  **Navigation ("Whiteboard" Map Router):** * *Vision:* Read hand-drawn dive site maps from a photo.
    * *Logic:* Correlate map data with device compass headings to guide the user.
2.  **Marine Identification (Virtual Biologist):** * *Vision:* Frame streaming to Gemini API.
    * *Interaction:* User taps screen/uses audio cue ("What is this?") to ID marine life (e.g., Hawksbill Sea Turtle) and give safety facts.
3.  **Health Metrics (Visual Gauge Reading):**
    * *Vision:* Zero-shot OCR on analog Submersible Pressure Gauges (SPG) and dive watches. 
    * *Logic:* Read bar/depth and trigger alerts (e.g., "Turnaround pressure reached").
4.  **Cautions & Hazards (Context-Aware Alerts):**
    * *Vision:* Actively monitor visual feed for rapid depth changes or dangerous environments (e.g., deep blue voids).

## The UI/UX Requirements (Live Agent Focus)
Since this is for the "Live Agent" category, the UI needs to be highly conversational and visually indicate active monitoring:
* **Main View:** Full-screen camera feed (acting as the diver's mask/vision).
* **Agent Status:** An indicator (pulsing dot or waveform) showing the AI is "listening" and "watching".
* **Interaction Triggers:** A large, easily tappable "Push to Talk" button (simulating a glove-friendly UI or full-face mask audio trigger).
* **Information Overlay:** Clean, high-contrast text overlays for crucial agent responses (Compass heading, Depth reading, Hazard warnings).

## The Demo Strategy ("Wizard of Oz")
**Crucial Context for Development:** We are not testing this underwater. The app must be designed to work in a living room setup:
* The camera will point at a large monitor playing POV scuba diving YouTube videos.
* Maps will be hand-drawn on paper and held up to the camera.
* Gauges will be printed photos of analog SPGs held up to the camera.
* *Dev Note:* Avoid hardcoding fake responses if possible. Build the actual API loop so Gemini truly reads the monitor/printed gauges to impress the judges.

## Next Steps / Current Focus
1.  **API Connections:** Initialize Google Cloud and Gemini API keys securely.
2.  **Camera/Audio Loop (Frontend):** Build the React component that captures video frames and audio, sending them to the backend.
3.  **Agent System Prompting (Backend):** Refine the master prompt: *"You are an expert scuba diving assistant. Tell me what you see in this image, read any gauges, and warn the user of hazards..."*


## 🏗️ Technical Architecture & API Integration 

### 1. The Agent Backbone (ADK)
We utilize the **Agent Development Kit (ADK)** to manage the Scuba.ai state machine. The agent is orchestrated using a **Manager Agent** that delegates to specialized sub-agents:

* **SafetyAgent:** Monitors gauge OCR and depth limits.
* **BioAgent:** Handles species identification via the Vision API.
* **NavAgent:** Matches live compass data against the cached whiteboard map.

### 2. Multimodal Live Loop
The app establishes a **Stateful WebSocket (WSS)** connection to the **Gemini Multimodal Live API**. 
* **Video Ingest:** We stream JPEG frames (1 FPS for gauges, higher for bio-ID) and raw 16-bit PCM audio.
* **Low-Latency Output:** Using **gemini-live-2.5-flash-native-audio**, the agent provides "Barge-in" capable voice alerts (e.g., "STOP: Ascending too fast").

### 3. Google Cloud Integration
* **Vertex AI Agent Engine:** Our ADK agent is deployed here for production-grade scaling.
* **Cloud Run:** Powers the frontend web-socket proxy.
* **Firestore:** Stores user dive logs and historical whiteboard maps for persistent sessions.

