import logging
from app.agents.base import call_gemini
from app.prompts.safety import SAFETY_PROMPT
from app.models.messages import AgentOutput

logger = logging.getLogger(__name__)

# Track the latest known gauge readings for trend detection
_last_reading: dict | None = None


async def handle_gauge_frame(payload: str, metadata: dict) -> dict:
    """Read gauges from a camera frame and check safety thresholds."""
    global _last_reading
    try:
        context = "Read any visible dive gauges (SPG, depth gauge, dive computer, watch) in this image."
        if _last_reading:
            context += f" Previous reading: PSI={_last_reading.get('psi', '?')}, Depth={_last_reading.get('depth_ft', '?')}ft."

        result = await call_gemini(SAFETY_PROMPT, payload, context)
        output = AgentOutput(**result)

        # Cache the reading for trend detection
        if output.metadata and any(
            k in output.metadata for k in ("psi", "bar", "depth_ft", "depth_m")
        ):
            _last_reading = output.metadata

        # Double-check thresholds even if Gemini didn't flag them
        output = _check_thresholds(output)

        return output.model_dump()
    except Exception as e:
        logger.error(f"SafetyAgent error: {e}")
        return AgentOutput(
            agent="safety",
            type="info",
            content=f"Gauge reading unavailable: {str(e)[:100]}",
            priority=0,
        ).model_dump()


def _check_thresholds(output: AgentOutput) -> AgentOutput:
    """Apply hard-coded safety thresholds as a backstop over the AI response."""
    m = output.metadata or {}
    alerts: list[str] = []

    psi = m.get("psi")
    bar = m.get("bar")
    depth_m = m.get("depth_m")
    depth_ft = m.get("depth_ft")

    # Air pressure checks
    pressure_bar = bar if bar is not None else (psi / 14.504 if psi else None)
    if pressure_bar is not None:
        if pressure_bar < 35:
            alerts.append("CRITICAL: Reserve pressure — begin ascent NOW")
        elif pressure_bar < 50:
            alerts.append("Turnaround pressure reached — head to exit")
        elif pressure_bar < 70:
            alerts.append("Monitor air — approaching turnaround pressure")

    # Depth checks
    depth = depth_m if depth_m is not None else (depth_ft * 0.3048 if depth_ft else None)
    if depth is not None:
        if depth > 30:
            alerts.append("Approaching recreational depth limit (30m)")
        elif depth > 18:
            alerts.append("Moderate depth — monitor NDL")

    if alerts:
        worst = alerts[0]
        is_critical = "CRITICAL" in worst or "limit" in worst.lower()
        return AgentOutput(
            agent="safety",
            type="hazard",
            content=worst,
            priority=10 if is_critical else 7,
            metadata={**m, "alert_level": "critical" if is_critical else "warning", "all_alerts": alerts},
        )

    return output


def get_last_reading() -> dict | None:
    """Return the most recent gauge reading."""
    return _last_reading
