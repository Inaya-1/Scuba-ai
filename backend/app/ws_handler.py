"""
WebSocket message router.

Routes incoming messages to the appropriate agent based on message type:
  - "frame"       → all three agents in parallel (safety, bio, nav if map cached)
  - "map_upload"  → NavAgent
  - "identify"    → BioAgent (user-triggered species ID)
  - "gauge_read"  → SafetyAgent (explicit gauge photo)
  - "nav_frame"   → NavAgent (explicit nav check)
"""

import asyncio
import logging
from app.agents.safety import handle_gauge_frame
from app.agents.bio import handle_bio_frame, handle_identify
from app.agents.nav import handle_map_upload, handle_nav_frame, get_cached_map

logger = logging.getLogger(__name__)


async def route_message(msg_type: str, payload: str, metadata: dict) -> dict | list[dict]:
    """Route a WebSocket message to the appropriate agent(s)."""

    if msg_type == "map_upload":
        return await handle_map_upload(payload, metadata)

    if msg_type == "identify":
        return await handle_identify(payload, metadata)

    if msg_type == "gauge_read":
        return await handle_gauge_frame(payload, metadata)

    if msg_type == "nav_frame":
        return await handle_nav_frame(payload, metadata)

    if msg_type == "frame":
        # Run safety and bio in parallel; add nav if a map is cached
        tasks = [
            handle_gauge_frame(payload, metadata),
            handle_bio_frame(payload, metadata),
        ]
        if get_cached_map() is not None:
            tasks.append(handle_nav_frame(payload, metadata))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out errors, keep valid responses, return highest-priority one
        valid = []
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Agent error: {r}")
            elif isinstance(r, dict):
                valid.append(r)

        if not valid:
            return {
                "agent": "manager",
                "type": "info",
                "content": "Analysis unavailable.",
                "priority": 0,
                "metadata": {},
            }

        # Return the highest-priority result to keep the overlay clean
        valid.sort(key=lambda x: x.get("priority", 0), reverse=True)
        best = valid[0]

        # If there's a hazard, always surface it regardless of other results
        hazards = [r for r in valid if r.get("type") == "hazard"]
        if hazards:
            best = hazards[0]

        return best

    return {"error": f"Unknown message type: {msg_type}"}
