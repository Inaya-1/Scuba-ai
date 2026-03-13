# Team 1: Navigation — "Whiteboard" Map Router

## Your Mission
Build the navigation feature that reads hand-drawn dive site maps, extracts landmarks and routes, and provides real-time compass-correlated guidance during a dive.

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

```
User uploads map photo
  │
  ▼
Frontend ──sendMap(base64)──► Backend WebSocket /ws
                                │
                                ▼
                          ws_handler.route_message("map_upload")
                                │
                                ▼
                          agents/nav.py → handle_map_upload()
                                │
                                ▼
                          Gemini Vision (prompts/nav.py)
                                │
                                ▼
                          Extracts landmarks, route, compass bearings
                                │
                                ▼
                          Caches in _cached_map (in-memory)
                                │
                                ▼
                          Returns AgentOutput → frontend overlay

Subsequently, every "frame" message also triggers:
  handle_nav_frame() → correlates live frame with cached map + compass heading
```

---

## Your Files

### Backend (Python)

| File | Purpose | Status |
|------|---------|--------|
| `backend/app/agents/nav.py` | NavAgent — map analysis + live frame nav guidance | **Scaffolded — extend it** |
| `backend/app/prompts/nav.py` | System prompt for Gemini map/nav calls | **Scaffolded — refine it** |
| `backend/app/agents/base.py` | Shared `call_gemini()` helper (do not modify) | Complete |
| `backend/app/ws_handler.py` | Routes `map_upload` and `nav_frame` to your agent | Complete |

### Frontend (TypeScript/React)

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/App.tsx` lines 170-174, 196-223 | Map button + map overlay | **Placeholder — replace it** |
| `frontend/src/services/backendSocket.ts` | `sendMap(base64)` method | Complete |
| `frontend/src/components/HUD.tsx` lines 63-67 | Heading display | Complete (reads `diveState.heading`) |

---

## What Already Works

1. **`scubaSocket.sendMap(base64)`** — sends a `map_upload` message over WebSocket
2. **`backend/app/agents/nav.py:handle_map_upload()`** — calls Gemini, parses landmarks, caches result
3. **`backend/app/agents/nav.py:handle_nav_frame()`** — correlates live frames with cached map + heading
4. **`ws_handler.py`** — when a `"frame"` message arrives AND a map is cached, `handle_nav_frame()` runs automatically in parallel with safety/bio agents
5. **`backendSocket.ts:sendFrame(base64, heading?)`** — already accepts an optional heading parameter
6. **Heading display** — HUD shows `diveState.heading` in degrees

---

## Tasks To Complete

### Task 1: Map Upload UI (Frontend)
Replace the placeholder map overlay in `App.tsx` (lines 196-223) with a real map upload flow.

**Requirements:**
- When the Map button is tapped, show a bottom sheet with:
  - "Take Photo" button (opens camera capture for a map photo)
  - "Choose File" button (file picker for map images)
  - Thumbnail previews of previously uploaded maps (if any)
- When a map is selected/captured:
  - Convert to base64 JPEG
  - Call `scubaSocket.sendMap(base64)`
  - Show a loading state while Gemini analyzes
  - Display the extracted route on success

**Suggested component:** Create `frontend/src/components/MapUpload.tsx`

```typescript
// Skeleton to get started
interface MapUploadProps {
  onUpload: (base64: string) => void;
  onClose: () => void;
}
```

Wire it into `App.tsx` by replacing the existing map overlay block.

### Task 2: Device Compass Integration (Frontend)
Replace the simulated heading in `App.tsx` (lines 95-105) with real device compass data.

**Implementation:**
```typescript
// Add to App.tsx inside the isStarted useEffect or a new useEffect
useEffect(() => {
  if (!isStarted) return;

  const handleOrientation = (e: DeviceOrientationEvent) => {
    // e.alpha is compass heading (0-360) on mobile
    // e.webkitCompassHeading is Safari-specific (iOS)
    const heading = (e as any).webkitCompassHeading ?? e.alpha ?? 0;
    setDiveState(prev => ({ ...prev, heading: Math.round(heading) }));
  };

  // iOS 13+ requires permission
  if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
    (DeviceOrientationEvent as any).requestPermission().then((state: string) => {
      if (state === 'granted') {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    });
  } else {
    window.addEventListener('deviceorientation', handleOrientation);
  }

  return () => window.removeEventListener('deviceorientation', handleOrientation);
}, [isStarted]);
```

Also update `handleFrame` in `App.tsx` to pass the heading to the backend:
```typescript
scubaSocket.sendFrame(base64, diveState.heading);
```
This is already supported — `sendFrame` accepts an optional `heading` parameter.

### Task 3: Route Visualization (Frontend)
After a map is analyzed, render the extracted route steps as a visual overlay.

**The backend returns this metadata structure:**
```json
{
  "landmarks": ["coral wall", "anchor point", "sandy patch"],
  "entry_point": "shore entry near rocks",
  "exit_point": "same as entry",
  "suggested_heading": 180,
  "route_steps": [
    {"heading": 90, "description": "Swim east along the wall", "distance_m": 30},
    {"heading": 180, "description": "Turn south at the anchor", "distance_m": 20}
  ]
}
```

**Suggested approach:**
- Create `frontend/src/components/RouteOverlay.tsx`
- Display route steps as a numbered list overlaid on the HUD
- Highlight the current step based on `diveState.heading` proximity to the step's heading
- Show a compass arrow pointing toward the next waypoint

### Task 4: Refine the Nav Prompt (Backend)
The prompt in `backend/app/prompts/nav.py` works but can be improved for the demo:
- Add guidance for recognizing common whiteboard map symbols (arrows, X marks, dotted lines)
- Tune the JSON output to always include `suggested_heading` even for simple maps
- Consider adding a "confidence" field so the UI can show uncertainty

### Task 5: Heading Correlation Logic (Backend)
Enhance `backend/app/agents/nav.py:handle_nav_frame()`:
- Compare `metadata.heading` with the next `route_steps[i].heading`
- If the diver is off-course by >30 degrees, increase priority and say "Turn left/right"
- Track which route step the diver is on (simple state: closest step based on heading history)

---

## Testing the Demo

1. Draw a dive site map on paper or whiteboard
2. Start the app, enter dive mode
3. Tap the Map button → upload/photograph the map
4. Verify the backend returns landmarks and a route
5. Point the camera at a screen playing a dive video
6. Verify the heading indicator and nav guidance update in real-time

### Test the backend independently:
```bash
cd backend
python -c "
import asyncio
from app.agents.nav import handle_map_upload
# Use a test base64 image string
result = asyncio.run(handle_map_upload('test_b64', {}))
print(result)
"
```

---

## Key Constraints
- Do NOT modify `backend/app/agents/base.py` or `backend/app/ws_handler.py` — other teams depend on them
- Do NOT change the WebSocket message format (type/payload/metadata) — keep backward-compatible
- Your `AgentOutput` must use `agent="nav"` and `type="navigation"`
- Keep the frontend camera feed working — don't block or slow down frame capture
