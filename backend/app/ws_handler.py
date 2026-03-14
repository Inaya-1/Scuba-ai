"""
WebSocket message router.

Routes incoming messages to the appropriate agent based on message type:
  - "frame"       → alternates between safety and bio agents (rate-limit friendly)
  - "map_upload"  → NavAgent
  - "identify"    → BioAgent (user-triggered species ID)
  - "gauge_read"  → SafetyAgent (explicit gauge photo)
  - "nav_frame"   → NavAgent (explicit nav check)
"""

import logging
from app.agents.safety import handle_gauge_frame
from app.agents.bio import handle_bio_frame, handle_identify
from app.agents.nav import handle_map_upload, handle_nav_frame, get_cached_map

logger = logging.getLogger(__name__)

# Round-robin counter: alternates which agent handles each "frame" message
# This keeps us within free-tier rate limits (1 Gemini call per frame instead of 2-3)
_frame_counter = 0


async def route_message(msg_type: str, payload: str, metadata: dict) -> dict | list[dict]:
    """Route a WebSocket message to the appropriate agent(s)."""
    global _frame_counter

    if msg_type == "map_upload":
        return await handle_map_upload(payload, metadata)

    if msg_type == "identify":
        return await handle_identify(payload, metadata)

    if msg_type == "gauge_read":
        return await handle_gauge_frame(payload, metadata)

    if msg_type == "nav_frame":
        return await handle_nav_frame(payload, metadata)

    if msg_type == "frame":
        _frame_counter += 1

        # Alternate between agents: safety on odd frames, bio on even
        # Nav only runs if a map is cached, replacing bio on every 3rd frame
        if get_cached_map() is not None and _frame_counter % 3 == 0:
            return await handle_nav_frame(payload, metadata)
        elif _frame_counter % 2 == 1:
            return await handle_gauge_frame(payload, metadata)
        else:
            return await handle_bio_frame(payload, metadata)

    return {"error": f"Unknown message type: {msg_type}"}
