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
from app.agents.nav import handle_map_upload, handle_map_refine, handle_nav_frame, get_cached_map

logger = logging.getLogger(__name__)


async def route_message(msg_type: str, payload: str, metadata: dict) -> dict | list[dict]:
    """Route a WebSocket message to the appropriate agent(s)."""

    if msg_type == "map_upload":
        return await handle_map_upload(payload, metadata)

    if msg_type == "map_refine":
        return await handle_map_refine(metadata)

    if msg_type == "identify":
        return await handle_identify(payload, metadata)

    if msg_type == "gauge_read":
        return await handle_gauge_frame(payload, metadata)

    if msg_type == "nav_frame":
        result = await handle_nav_frame(payload, metadata)
        return result if result else None

    if msg_type == "frame":
        tasks = [
            handle_gauge_frame(payload, metadata),
        ]
        # Auto bio identification when enabled by frontend
        if metadata.get("auto_bio"):
            tasks.append(handle_bio_frame(payload, metadata))
        if get_cached_map() is not None:
            tasks.append(handle_nav_frame(payload, metadata))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out errors and low-priority "no data" responses
        valid = []
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Agent error: {r}")
            elif isinstance(r, dict):
                # Skip empty safety readings (no gauges visible, priority 0)
                if r.get("agent") == "safety" and r.get("priority", 0) == 0:
                    continue
                valid.append(r)

        if not valid:
            return None

        # Return all valid results so each agent's response reaches the frontend
        return valid if len(valid) > 1 else valid[0]

    return {"error": f"Unknown message type: {msg_type}"}
