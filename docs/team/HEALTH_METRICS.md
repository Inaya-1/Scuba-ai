# Team 3: Health Metrics — Visual Gauge Reading & Safety Alerts

## Your Mission
Build the gauge reading and safety monitoring feature. The AI performs zero-shot OCR on analog dive gauges (SPGs, depth gauges, dive watches) held up to the camera, updates the HUD with real readings, and triggers alerts when safety thresholds are breached.

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
Two gauge reading paths:

1. PASSIVE (automatic, every 6s via "frame" message)
──────────────────────────────────────────────────
CameraFeed captures frame every 2s
  │
  ▼
App.tsx sends every 3rd frame to backend (every 6s)
  │
  ▼
ws_handler routes "frame" → runs ALL agents in parallel:
  ├── agents/safety.py → handle_gauge_frame()   ← YOUR CODE
  ├── agents/bio.py    → handle_bio_frame()
  └── agents/nav.py    → handle_nav_frame() (if map cached)
  │
  ▼
SafetyAgent reads gauges via Gemini Vision
  │
  ▼
_check_thresholds() applies hard-coded safety rules
  │
  ▼
Highest-priority result returned to frontend
  │
  ▼
App.tsx updates diveState (depth, airPressure, waterTemp) from metadata
HUD automatically reflects new values


2. EXPLICIT (user-triggered "Read this gauge" button)
────────────────────────────────────────────────────
User holds SPG photo up to camera, taps "Gauge" button
  │
  ▼
scubaSocket.sendGaugeRead(base64)
  │
  ▼
ws_handler routes "gauge_read" → handle_gauge_frame() exclusively
  │
  ▼
Full analysis + threshold check → response
```

---

## Your Files

### Backend (Python)

| File | Purpose | Status |
|------|---------|--------|
| `backend/app/agents/safety.py` | SafetyAgent — gauge OCR + `_check_thresholds()` safety rules | **Scaffolded — extend it** |
| `backend/app/prompts/safety.py` | System prompt for gauge reading with threshold definitions | **Scaffolded — refine it** |
| `backend/app/agents/base.py` | Shared `call_gemini()` helper (do not modify) | Complete |
| `backend/app/ws_handler.py` | Routes `"gauge_read"` to your agent; `"frame"` triggers passive gauge scan | Complete |

### Frontend (TypeScript/React)

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/components/HUD.tsx` | Full dive metrics display (depth, air, temp, heading, bottom time) | **Complete — enhance it** |
| `frontend/src/App.tsx` lines 36-49 | Updates `diveState` from backend response metadata | Complete |
| `frontend/src/App.tsx` lines 91-105 | Simulated metrics (to replace with real data) | **Replace with real data** |
| `frontend/src/services/backendSocket.ts` | `sendGaugeRead(base64)` method | Complete |
| `frontend/src/components/ResponseOverlay.tsx` | Shows hazard alerts with red styling | Complete (basic) |

---

## What Already Works

1. **`scubaSocket.sendGaugeRead(base64)`** — sends a `"gauge_read"` message to the backend
2. **`backend/app/agents/safety.py:handle_gauge_frame()`** — calls Gemini Vision with the safety prompt, parses gauge values
3. **`_check_thresholds()`** — applies hard-coded safety rules as a backstop over the AI response:
   - Air < 35 bar → CRITICAL (priority 10)
   - Air < 50 bar → Turnaround (priority 10)
   - Air < 70 bar → Warning (priority 7)
   - Depth > 30m → Depth limit warning (priority 10)
   - Depth > 18m → Moderate depth note (priority 7)
4. **HUD auto-updates** — `App.tsx` extracts `depth_m`, `bar`, `psi`, `temp_c` from response metadata and updates `diveState`
5. **HUD display** — shows depth (m), air (bar), temp (°C), heading (°), bottom time (mm:ss)
6. **Air pressure color coding** — HUD already turns red when `airPressure < 50`
7. **ResponseOverlay** — shows "IMMEDIATE ACTION REQUIRED" banner when `type === "hazard"`
8. **Reading history** — `_last_reading` in `safety.py` tracks the previous gauge reading for trend detection

---

## Tasks To Complete

### Task 1: "Read Gauge" Button (Frontend)
Add a gauge reading button to the control bar in `App.tsx`.

**Implementation:**

Add a ref to capture the latest frame (if not already present from Team 2's work):
```typescript
const latestFrameRef = useRef<string>('');

// In handleFrame:
const handleFrame = useCallback((base64: string) => {
  latestFrameRef.current = base64;
  // ... rest of existing logic
}, []);
```

Add the gauge read handler:
```typescript
const handleGaugeRead = useCallback(() => {
  if (latestFrameRef.current) {
    scubaSocket.sendGaugeRead(latestFrameRef.current);
  }
}, []);
```

Add the button (use the `Gauge` icon from lucide-react):
```tsx
import { Gauge } from 'lucide-react';

// Add to the control bar div (lines 168-194), next to Settings:
<button
  onClick={handleGaugeRead}
  className="p-4 rounded-full glass-panel text-white/60 active:scale-90 transition-all"
>
  <Gauge className="w-6 h-6" />
</button>
```

### Task 2: Full-Screen Hazard Alert (Frontend)
When a hazard response comes back, show a prominent full-screen flash alert — not just a small overlay card.

**Create `frontend/src/components/HazardAlert.tsx`:**
```typescript
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { AgentResponse } from '../types';

interface HazardAlertProps {
  response: AgentResponse | null;
}

export const HazardAlert: React.FC<HazardAlertProps> = ({ response }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (response?.type === 'hazard') {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [response]);

  return (
    <AnimatePresence>
      {visible && response && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center pt-20"
        >
          {/* Red flash overlay */}
          <div className="absolute inset-0 bg-dive-red/10 animate-pulse" />

          {/* Alert banner */}
          <div className="glass-panel border-2 border-dive-red px-8 py-4 flex items-center gap-4 max-w-xl">
            <AlertTriangle className="w-8 h-8 text-dive-red shrink-0" />
            <div>
              <p className="text-dive-red font-display font-bold text-sm uppercase">
                {response.priority === 'critical' ? 'CRITICAL ALERT' : 'SAFETY WARNING'}
              </p>
              <p className="text-white font-medium text-sm mt-1">
                {response.content}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
```

Wire it in `App.tsx`:
```tsx
import { HazardAlert } from './components/HazardAlert';

// Inside the isStarted block, add:
<HazardAlert response={responses.find(r => r.type === 'hazard') ?? null} />
```

### Task 3: Ascent Rate Monitoring (Backend)
Add ascent rate calculation to `backend/app/agents/safety.py`.

**Implementation in `_check_thresholds()`:**
```python
# Add at the top of _check_thresholds, before existing checks:
if _last_reading and depth is not None:
    prev_depth = _last_reading.get("depth_m")
    if prev_depth is not None:
        # Frames arrive ~6s apart
        ascent_rate = (prev_depth - depth) / 6.0 * 60  # meters per minute
        if ascent_rate > 18:  # Max safe ascent: 18 m/min (PADI)
            alerts.append(f"CRITICAL: Ascending too fast ({ascent_rate:.0f} m/min). Slow down!")
        elif ascent_rate > 10:
            alerts.append(f"Ascent rate high ({ascent_rate:.0f} m/min). Slow down.")
        m["ascent_rate_mpm"] = round(ascent_rate, 1)
```

### Task 4: HUD Enhancements (Frontend)
Enhance `frontend/src/components/HUD.tsx` with:

**a) Air pressure progress bar:**
```tsx
// Add below the Air reading (after line 32):
<div className="w-20 h-1 bg-white/10 rounded-full overflow-hidden mt-1">
  <div
    className={`h-full rounded-full transition-all duration-500 ${
      state.airPressure < 50 ? 'bg-dive-red' :
      state.airPressure < 70 ? 'bg-dive-orange' : 'bg-dive-cyan'
    }`}
    style={{ width: `${Math.min(100, (state.airPressure / 200) * 100)}%` }}
  />
</div>
```

**b) Ascent rate indicator** (when available from metadata):
If you add `ascent_rate_mpm` to the DiveState type:
```typescript
// In types.ts, add to DiveState:
ascentRate?: number;
```
Then show it in the HUD:
```tsx
{state.ascentRate != null && state.ascentRate > 5 && (
  <div className={`flex items-center gap-1 ${
    state.ascentRate > 18 ? 'text-dive-red animate-pulse' :
    state.ascentRate > 10 ? 'text-dive-orange' : 'text-dive-cyan'
  }`}>
    <ArrowUp className="w-3 h-3" />
    <span className="hud-text">{state.ascentRate.toFixed(0)} m/min</span>
  </div>
)}
```

### Task 5: Refine the Safety Prompt (Backend)
Improve `backend/app/prompts/safety.py`:
- Add guidance for reading specific gauge types (console gauges, wrist-mounted, digital dive computers)
- The demo uses **printed photos of gauges** held up to the camera — tune the prompt for this:
  - "The image may show a printed photograph of an analog gauge, not a real underwater scene"
  - "Focus on the needle position and numbered scale markings"
- Add temperature reading guidance (many SPGs have a temperature gauge on the console)
- Consider handling dive computers with digital readouts (Suunto, Shearwater, etc.)

### Task 6: Replace Simulated Metrics (Frontend)
Currently `App.tsx` lines 91-105 simulate depth/heading with random fluctuations. Once gauge reading is working:

- Only apply simulation when no real gauge data has been received
- When a gauge reading comes in via metadata, use those values and stop simulating that metric
- The heading should come from Team 1's compass integration (or keep simulated as fallback)

```typescript
// Suggested approach: track whether we've received real data
const [hasRealGaugeData, setHasRealGaugeData] = useState(false);

// In the onResponse callback, when gauge metadata arrives:
if (res.metadata && (res.metadata.depth_m != null || res.metadata.bar != null)) {
  setHasRealGaugeData(true);
}

// In the simulation interval, skip depth/air if we have real data:
setDiveState(prev => ({
  ...prev,
  bottomTime: prev.bottomTime + 1,
  ...(hasRealGaugeData ? {} : {
    depth: Math.max(0, prev.depth + (Math.random() - 0.5) * 0.1),
  }),
  heading: (prev.heading + Math.floor((Math.random() - 0.5) * 2) + 360) % 360,
}));
```

---

## Testing the Demo

### Print these test images:
Search Google Images and print (or display on a second monitor):
- "analog SPG gauge 2100 PSI" — normal reading
- "analog SPG gauge 500 PSI" — low air (should trigger turnaround alert)
- "analog depth gauge 100 feet" — moderate depth
- "analog depth gauge 130 feet" — deep (should trigger depth limit warning)
- "dive computer display" — digital readout

### Test flow:
1. Start the app, enter dive mode
2. Hold a printed gauge photo up to the camera
3. **Passive test:** Wait 6 seconds for the automatic frame analysis — check HUD updates
4. **Active test:** Tap the Gauge button — check for immediate response
5. **Alert test:** Hold up a low-PSI gauge photo — verify hazard alert fires
6. **Threshold test:** Verify the HUD air reading turns red below 50 bar

### Test the backend independently:
```bash
cd backend
python -c "
import asyncio
from app.agents.safety import handle_gauge_frame

# Simulate a frame with a gauge visible
result = asyncio.run(handle_gauge_frame('test_b64', {}))
print(result)

# Test threshold logic directly
from app.agents.safety import _check_thresholds
from app.models.messages import AgentOutput

low_air = AgentOutput(
    agent='safety', type='info', content='Air at 400 PSI',
    priority=1, metadata={'psi': 400, 'bar': 28, 'depth_ft': 60, 'depth_m': 18.3}
)
result = _check_thresholds(low_air)
print(result)  # Should escalate to hazard with priority 10
"
```

---

## Key Constraints
- Do NOT modify `backend/app/agents/base.py` or `backend/app/ws_handler.py` — other teams depend on them
- Do NOT change the WebSocket message format (type/payload/metadata) — keep backward-compatible
- Your `AgentOutput` must use `agent="safety"` and `type="hazard"` for alerts or `type="info"` for normal readings
- The metadata keys for HUD integration are fixed: `depth_m`, `depth_ft`, `psi`, `bar`, `temp_c` — App.tsx reads these exact keys
- Safety threshold rules in `_check_thresholds()` are the **backstop** — they must always run even if Gemini misses a dangerous reading
- Keep the HUD responsive — gauge data updates should feel instant on the display
