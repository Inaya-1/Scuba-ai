import logging
import time
from app.agents.base import call_gemini
from app.prompts.nav import NAV_PROMPT
from app.models.messages import AgentOutput

logger = logging.getLogger(__name__)

# In-memory cache of the last analyzed map (persists for the session)
_cached_map: dict | None = None
_cached_map_image: str | None = None  # base64 of the original map image for refinement
_current_step_index: int = 0

# Visual odometry state
_total_distance_m: float = 0.0
_step_distance_m: float = 0.0
_last_frame_time: float | None = None
_prev_landmarks_seen: list[str] = []


def _heading_diff(current: float, target: float) -> float:
    """Signed heading difference: positive = turn right, negative = turn left."""
    diff = (target - current + 540) % 360 - 180
    return diff


def _get_turn_direction(diff: float) -> str:
    if diff > 0:
        return "right"
    return "left"


async def handle_map_upload(payload: str, metadata: dict) -> dict:
    """Analyze a hand-drawn dive site map and cache the landmarks."""
    global _cached_map, _cached_map_image, _current_step_index, _total_distance_m, _step_distance_m, _last_frame_time, _prev_landmarks_seen
    _current_step_index = 0
    _total_distance_m = 0.0
    _step_distance_m = 0.0
    _last_frame_time = None
    _prev_landmarks_seen = []
    try:
        result = await call_gemini(
            NAV_PROMPT,
            payload,
            "Analyze this hand-drawn dive site map. Extract all landmarks, entry/exit points, and suggest a route with compass bearings.",
        )
        output = AgentOutput(**result)
        _cached_map = output.metadata
        _cached_map_image = payload
        data = output.model_dump()
        if data.get("metadata") is None:
            data["metadata"] = {}
        data["metadata"]["_source"] = "map_upload"
        return data
    except Exception as e:
        logger.error(f"NavAgent map error: {e}")
        return AgentOutput(
            agent="nav",
            type="navigation",
            content=f"Could not analyze map: {str(e)[:100]}",
            priority=0,
        ).model_dump()


async def handle_map_refine(metadata: dict) -> dict:
    """Re-analyze the cached map image with user feedback to correct landmarks/route."""
    global _cached_map, _current_step_index, _total_distance_m, _step_distance_m, _last_frame_time, _prev_landmarks_seen

    if not _cached_map_image:
        return AgentOutput(
            agent="nav",
            type="navigation",
            content="No map to refine. Upload a map first.",
            priority=1,
        ).model_dump()

    feedback = metadata.get("feedback", "")
    prev_analysis = _cached_map or {}

    _current_step_index = 0
    _total_distance_m = 0.0
    _step_distance_m = 0.0
    _last_frame_time = None
    _prev_landmarks_seen = []

    try:
        context = (
            f"You previously analyzed this map and produced: {prev_analysis}. "
            f"The diver wants corrections: \"{feedback}\". "
            f"Re-analyze the map with this feedback. Fix any missed landmarks, adjust the route, and return updated JSON."
        )
        result = await call_gemini(NAV_PROMPT, _cached_map_image, context)
        output = AgentOutput(**result)
        _cached_map = output.metadata
        data = output.model_dump()
        if data.get("metadata") is None:
            data["metadata"] = {}
        data["metadata"]["_source"] = "map_refine"
        return data
    except Exception as e:
        logger.error(f"NavAgent refine error: {e}")
        return AgentOutput(
            agent="nav",
            type="navigation",
            content=f"Could not refine map: {str(e)[:100]}",
            priority=0,
        ).model_dump()


async def handle_nav_frame(payload: str, metadata: dict) -> dict:
    """Analyze a live frame for navigation context using the cached map."""
    global _current_step_index, _total_distance_m, _step_distance_m, _last_frame_time, _prev_landmarks_seen

    if _cached_map is None:
        return AgentOutput(
            agent="nav",
            type="navigation",
            content="No map uploaded yet. Upload a dive site map for navigation.",
            priority=1,
        ).model_dump()

    try:
        heading = metadata.get("heading")
        route_steps = _cached_map.get("route_steps", [])
        now = time.time()

        # Heading correlation: check if diver is off-course
        course_guidance = ""
        priority = 5
        if heading is not None and route_steps and _current_step_index < len(route_steps):
            target_heading = route_steps[_current_step_index].get("heading", 0)
            diff = _heading_diff(heading, target_heading)

            if abs(diff) > 30:
                direction = _get_turn_direction(diff)
                course_guidance = f" You are off-course by {abs(int(diff))}°. Turn {direction} toward heading {target_heading}°."
                priority = 7
            elif abs(diff) <= 15 and _current_step_index < len(route_steps) - 1:
                _current_step_index += 1
                _step_distance_m = 0.0

        # Build context with odometry request
        context = f"The diver previously uploaded a map with these landmarks: {_cached_map}. "
        context += f"Current compass heading: {heading if heading is not None else 'unknown'}°. "
        context += f"Current route step: {_current_step_index + 1} of {len(route_steps)}. "
        context += f"Previously visible landmarks: {_prev_landmarks_seen if _prev_landmarks_seen else 'none yet'}. "
        context += f"Distance traveled so far: {_total_distance_m:.1f}m total, {_step_distance_m:.1f}m on current step. "
        if course_guidance:
            context += f"IMPORTANT:{course_guidance} "
        context += "Based on what you see in this live frame, provide navigation guidance and estimate distance traveled since last frame."

        result = await call_gemini(NAV_PROMPT, payload, context)
        output = AgentOutput(**result)

        # Extract visual odometry estimate from Gemini response
        odom = output.metadata.get("distance_estimate_m", 0) if output.metadata else 0
        try:
            odom = float(odom)
        except (TypeError, ValueError):
            odom = 0.0
        # Clamp to reasonable range (0-10m per 6s frame interval ≈ max ~1.7m/s swim speed)
        odom = max(0.0, min(odom, 10.0))

        _total_distance_m += odom
        _step_distance_m += odom

        # Track which landmarks Gemini sees for continuity
        if output.metadata and output.metadata.get("visible_landmarks"):
            _prev_landmarks_seen = output.metadata["visible_landmarks"]

        # Inject odometry data into output metadata
        if output.metadata is None:
            output.metadata = {}
        output.metadata["total_distance_m"] = round(_total_distance_m, 1)
        output.metadata["step_distance_m"] = round(_step_distance_m, 1)
        output.metadata["current_step_index"] = _current_step_index

        if priority > output.priority:
            output.priority = priority
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
