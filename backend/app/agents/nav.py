import logging
from app.agents.base import call_gemini
from app.prompts.nav import NAV_PROMPT
from app.models.messages import AgentOutput

logger = logging.getLogger(__name__)

# In-memory cache of the last analyzed map (persists for the session)
_cached_map: dict | None = None


async def handle_map_upload(payload: str, metadata: dict) -> dict:
    """Analyze a hand-drawn dive site map and cache the landmarks."""
    global _cached_map
    try:
        result = await call_gemini(
            NAV_PROMPT,
            payload,
            "Analyze this hand-drawn dive site map. Extract all landmarks, entry/exit points, and suggest a route with compass bearings.",
        )
        output = AgentOutput(**result)
        _cached_map = output.metadata
        return output.model_dump()
    except Exception as e:
        logger.error(f"NavAgent map error: {e}")
        return AgentOutput(
            agent="nav",
            type="navigation",
            content=f"Could not analyze map: {str(e)[:100]}",
            priority=0,
        ).model_dump()


async def handle_nav_frame(payload: str, metadata: dict) -> dict:
    """Analyze a live frame for navigation context using the cached map."""
    if _cached_map is None:
        return AgentOutput(
            agent="nav",
            type="navigation",
            content="No map uploaded yet. Upload a dive site map for navigation.",
            priority=1,
        ).model_dump()

    try:
        context = f"The diver previously uploaded a map with these landmarks: {_cached_map}. "
        context += f"Current compass heading: {metadata.get('heading', 'unknown')}°. "
        context += "Based on what you see in this live frame, provide navigation guidance."

        result = await call_gemini(NAV_PROMPT, payload, context)
        output = AgentOutput(**result)
        return output.model_dump()
    except Exception as e:
        logger.error(f"NavAgent frame error: {e}")
        return AgentOutput(
            agent="nav",
            type="navigation",
            content=f"Navigation unavailable: {str(e)[:100]}",
            priority=0,
        ).model_dump()


def get_cached_map() -> dict | None:
    """Return the cached map data for other agents or the frontend."""
    return _cached_map
