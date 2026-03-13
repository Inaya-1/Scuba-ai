# Team 2: Marine Identification — Virtual Biologist

## Your Mission
Build the marine life identification feature. Users point the camera at a creature and tap the screen or say "What is this?" to get an instant species ID with safety info and fun facts.

---

## Setup

```bash
# Clone the repo and install dependencies
git clone <repo-url> && cd Scuba-ai

# Backend
cd backend
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY
uv sync

# Frontend
cd ../frontend
npm install
```

### Running locally (two terminals)

```bash
# Terminal 1 — Backend (port 8000)
cd backend
uv run uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend (port 3000)
cd frontend
npm run dev
```

The Vite dev server proxies `/ws` and `/api` to `localhost:8000` automatically.

---

## Architecture Overview

There are **two paths** for marine ID — both should work:

```
Path 1: STRUCTURED (Backend WebSocket — tap to identify)
─────────────────────────────────────────────────────────
User taps screen / hits "What is this?" button
  │
  ▼
Frontend captures current frame
  │
  ▼
scubaSocket.sendIdentify(base64, "What is this?")
  │
  ▼
Backend ws_handler → route_message("identify")
  │
  ▼
agents/bio.py → handle_identify()
  │
  ▼
Gemini Vision (prompts/bio.py) → structured JSON
  │
  ▼
AgentOutput with metadata: {common_name, scientific_name, safety_level, fun_fact}
  │
  ▼
Frontend ResponseOverlay renders species card


Path 2: REAL-TIME (Gemini Live API — voice triggered)
─────────────────────────────────────────────────────
User holds Push-to-Talk button and says "What is this?"
  │
  ▼
Audio streams directly to Gemini Live API (client-to-server)
  │
  ▼
Gemini sees the latest video frame + hears the question
  │
  ▼
Responds with voice: "That's a Hawksbill Sea Turtle. They're critically endangered."
  │
  ▼
Audio plays back through browser speakers
Text response also appears in ResponseOverlay
```

**Path 1** gives structured data (scientific name, safety level in metadata).
**Path 2** gives instant voice response but unstructured text.
Both should be functional for the demo — the judge can tap OR speak.

---

## Your Files

### Backend (Python)

| File | Purpose | Status |
|------|---------|--------|
| `backend/app/agents/bio.py` | BioAgent — `handle_identify()` (user-triggered) + `handle_bio_frame()` (passive scan) | **Scaffolded — extend it** |
| `backend/app/prompts/bio.py` | System prompt for species ID with structured metadata | **Scaffolded — refine it** |
| `backend/app/agents/base.py` | Shared `call_gemini()` helper (do not modify) | Complete |
| `backend/app/ws_handler.py` | Routes `"identify"` to your agent; `"frame"` triggers passive `handle_bio_frame()` | Complete |

### Frontend (TypeScript/React)

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/App.tsx` lines 168-194 | Bottom control bar (Map, Mic, Settings buttons) | **Add ID button here** |
| `frontend/src/components/ResponseOverlay.tsx` | Displays agent responses with priority colors | **Extend for species cards** |
| `frontend/src/services/backendSocket.ts` | `sendIdentify(base64, prompt?)` method | Complete |
| `frontend/src/services/liveApi.ts` | Voice path — already streams audio to Gemini Live | Complete |
| `frontend/src/components/CameraFeed.tsx` | Captures frames every 2s | Complete |

---

## What Already Works

1. **`scubaSocket.sendIdentify(base64, prompt?)`** — sends an `"identify"` message to the backend
2. **`backend/app/agents/bio.py:handle_identify()`** — calls Gemini with the bio prompt, returns structured species data
3. **`backend/app/agents/bio.py:handle_bio_frame()`** — passive background scan on every `"frame"` message (runs in parallel with safety/nav)
4. **Push-to-talk voice** — holding the Mic button streams audio to Gemini Live API, which can answer "What is this?" by voice
5. **ResponseOverlay** — already renders agent responses with Fish icon for `agent === 'bio'`
6. **Species logging** — `_species_log` in `bio.py` tracks all identified species in the session

---

## Tasks To Complete

### Task 1: "What Is This?" Button (Frontend)
Add a species ID trigger button to the control bar in `App.tsx`.

**Implementation in `App.tsx`:**

Add a ref to capture the latest frame:
```typescript
const latestFrameRef = useRef<string>('');

// Update handleFrame to cache the latest frame
const handleFrame = useCallback((base64: string) => {
  latestFrameRef.current = base64;
  frameCountRef.current += 1;
  geminiLive.sendFrame(base64);
  if (frameCountRef.current % 3 === 0) {
    scubaSocket.sendFrame(base64);
  }
}, []);
```

Add the identify handler:
```typescript
const handleIdentify = useCallback(() => {
  if (latestFrameRef.current) {
    scubaSocket.sendIdentify(latestFrameRef.current, "What is this?");
  }
}, []);
```

Add the button to the control bar (between Map and Mic buttons):
```tsx
import { Fish } from 'lucide-react';

<button
  onClick={handleIdentify}
  className="p-4 rounded-full glass-panel text-white/60 active:scale-90 transition-all"
>
  <Fish className="w-6 h-6" />
</button>
```

### Task 2: Tap-to-Identify (Frontend)
Allow tapping anywhere on the camera feed to trigger identification.

**Implementation:** Modify `CameraFeed.tsx` to accept an `onTap` callback:
```typescript
interface CameraFeedProps {
  onFrame: (base64: string) => void;
  onTap?: () => void;  // NEW
  isStreaming: boolean;
}
```

Add a click/tap handler to the video container:
```tsx
<div
  className="relative w-full h-full bg-black overflow-hidden"
  onClick={() => onTap?.()}  // Tap triggers species ID
>
```

Wire it in `App.tsx`:
```tsx
<CameraFeed onFrame={handleFrame} onTap={handleIdentify} isStreaming={isStarted} />
```

### Task 3: Rich Species Card (Frontend)
Enhance `ResponseOverlay.tsx` to show a detailed species card when `type === "species"`.

**The backend returns this metadata structure:**
```json
{
  "common_name": "Hawksbill Sea Turtle",
  "scientific_name": "Eretmochelys imbricata",
  "safety_level": "safe",
  "fun_fact": "They are critically endangered and feed on sponges.",
  "safety_advice": "Maintain 3m distance. Do not touch."
}
```

**Suggested species card design:**
```tsx
{res.type === 'species' && res.metadata && (
  <div className="mt-2 space-y-1">
    <p className="text-[10px] font-mono text-dive-cyan/60 italic">
      {res.metadata.scientific_name}
    </p>
    <div className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
      res.metadata.safety_level === 'dangerous' ? 'bg-dive-red/20 text-dive-red' :
      res.metadata.safety_level === 'caution' ? 'bg-dive-orange/20 text-dive-orange' :
      'bg-green-500/20 text-green-400'
    }`}>
      {res.metadata.safety_level}
    </div>
    {res.metadata.fun_fact && (
      <p className="text-[11px] text-white/50">{res.metadata.fun_fact}</p>
    )}
  </div>
)}
```

### Task 4: Dangerous Species Alert (Frontend)
When a dangerous species is identified, show a prominent warning:

```tsx
// In ResponseOverlay.tsx, add above the species card:
{res.type === 'species' && res.metadata?.safety_level === 'dangerous' && (
  <div className="mt-2 flex items-center gap-1 text-dive-red font-bold text-[10px] uppercase animate-pulse">
    <AlertTriangle className="w-3 h-3" />
    DANGEROUS — KEEP DISTANCE
  </div>
)}
```

### Task 5: Refine the Bio Prompt (Backend)
Improve `backend/app/prompts/bio.py`:
- Add guidance for identifying common demo species (since the camera will point at a monitor playing dive footage)
- Ensure the prompt handles low-quality/blurry images gracefully (common with screen recordings)
- Add guidance to distinguish between similar species (e.g., different turtle species)
- Consider adding a `confidence` field to metadata

### Task 6: Species Log Endpoint (Backend — Optional)
Expose the session's species log via a REST endpoint for a "dive summary" feature:

```python
# In backend/app/main.py, add:
from app.agents.bio import get_species_log

@app.get("/api/species-log")
async def species_log():
    return {"species": get_species_log()}
```

---

## Testing the Demo

1. Start the app, enter dive mode
2. Point the camera at a monitor playing a scuba diving YouTube video (lots of fish)
3. Tap the Fish button or tap the screen — verify species card appears in overlay
4. Hold Push-to-Talk and say "What is that fish?" — verify voice response plays
5. Point at a photo of a lionfish or stonefish — verify the dangerous species alert fires

### Test images for development:
Search Google Images for:
- "hawksbill sea turtle underwater" — safe species
- "lionfish underwater" — dangerous species (venomous spines)
- "great white shark underwater" — dangerous species
- "clownfish anemone" — safe species, fun facts
- "coral reef wide shot" — general scene (no specific ID)

### Test the backend independently:
```bash
cd backend
python -c "
import asyncio
from app.agents.bio import handle_identify
# Use a test base64 image
result = asyncio.run(handle_identify('test_b64', {'prompt': 'What is this?'}))
print(result)
"
```

---

## Key Constraints
- Do NOT modify `backend/app/agents/base.py` or `backend/app/ws_handler.py` — other teams depend on them
- Do NOT change the WebSocket message format (type/payload/metadata) — keep backward-compatible
- Your `AgentOutput` must use `agent="bio"` and `type="species"` (or `"info"` for general scenes)
- The `sendIdentify()` frontend method is ready — do NOT rename it
- Keep voice (Live API) and structured (backend WS) paths both functional — demo may use either
