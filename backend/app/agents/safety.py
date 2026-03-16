import logging
import time
from app.agents.base import call_gemini
from app.prompts.safety import SAFETY_PROMPT
from app.models.messages import AgentOutput

logger = logging.getLogger(__name__)

# Track the latest known gauge readings for trend detection
_last_reading: dict | None = None
# Sliding window of (depth_m, timestamp) for ascent/descent rate smoothing
_depth_history: list[tuple[float, float]] = []
_MAX_DEPTH_HISTORY = 4


async def handle_gauge_frame(payload: str, metadata: dict) -> dict:
    """Read gauges from a camera frame and check safety thresholds."""
    global _last_reading
    try:
        context = "Read any visible dive gauges (SPG, depth gauge, dive computer, watch) in this image."
        if _last_reading:
            parts = []
            if _last_reading.get("psi"):
                parts.append(f"PSI={_last_reading['psi']}")
            if _last_reading.get("bar"):
                parts.append(f"Bar={_last_reading['bar']}")
            if _last_reading.get("depth_ft"):
                parts.append(f"Depth={_last_reading['depth_ft']}ft")
            if _last_reading.get("depth_m"):
                parts.append(f"Depth={_last_reading['depth_m']}m")
            if _last_reading.get("temp_c"):
                parts.append(f"Temp={_last_reading['temp_c']}°C")
            if _last_reading.get("ndl_min"):
                parts.append(f"NDL={_last_reading['ndl_min']}min")
            if parts:
                context += f" Previous reading: {', '.join(parts)}."

        result = await call_gemini(SAFETY_PROMPT, payload, context)
        output = AgentOutput(**result)

        # Cache the reading for trend detection
        if output.metadata and any(
            k in output.metadata for k in ("psi", "bar", "depth_ft", "depth_m", "temp_c", "ndl_min", "cns_percent")
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
    global _last_reading
    m = dict(output.metadata or {})
    alerts: list[str] = []

    psi = m.get("psi")
    bar = m.get("bar")
    depth_m = m.get("depth_m")
    depth_ft = m.get("depth_ft")
    temp_c = m.get("temp_c")
    ndl_min = m.get("ndl_min")
    cns_percent = m.get("cns_percent")
    po2 = m.get("po2")

    # ── Ascent / Descent Rate (smoothed over multiple readings) ──
    depth = depth_m if depth_m is not None else (depth_ft * 0.3048 if depth_ft else None)
    if depth is not None:
        now = time.time()
        _depth_history.append((depth, now))
        # Keep only the last N readings
        while len(_depth_history) > _MAX_DEPTH_HISTORY:
            _depth_history.pop(0)

        if len(_depth_history) >= 3:
            # Average rate across consecutive pairs for smoothing
            rates = []
            for i in range(1, len(_depth_history)):
                d_prev, t_prev = _depth_history[i - 1]
                d_curr, t_curr = _depth_history[i]
                dt = t_curr - t_prev
                if dt > 0:
                    rates.append((d_prev - d_curr) / dt * 60)  # m/min, positive = ascending
            if rates:
                ascent_rate = sum(rates) / len(rates)
                descent_rate = -ascent_rate
                m["ascent_rate_mpm"] = round(ascent_rate, 1)

                if ascent_rate > 18:
                    alerts.append(f"Ease up — you're coming up way too fast at {ascent_rate:.0f} meters a minute. Slow it down, let the bubbles lead.")
                elif ascent_rate > 10:
                    alerts.append(f"Your ascent rate's a bit high at {ascent_rate:.0f} meters a minute. Take it easy on the way up.")

                if descent_rate > 30:
                    alerts.append(f"You're dropping fast — {descent_rate:.0f} meters a minute. Slow down and equalize.")
        elif len(_depth_history) == 2:
            # Only 2 readings: calculate but don't trigger CRITICAL alerts (not enough data)
            d_prev, t_prev = _depth_history[0]
            d_curr, t_curr = _depth_history[1]
            dt = t_curr - t_prev
            if dt > 0:
                ascent_rate = (d_prev - d_curr) / dt * 60
                m["ascent_rate_mpm"] = round(ascent_rate, 1)

    # ── Air Pressure Checks ──
    pressure_bar = bar if bar is not None else (psi / 14.504 if psi else None)
    if pressure_bar is not None:
        if pressure_bar < 35:
            alerts.append(f"You're down to {int(pressure_bar)} bar — that's reserve. Start heading up now.")
        elif pressure_bar < 50:
            alerts.append(f"Air's at {int(pressure_bar)} bar. Time to turn the dive and head back.")
        elif pressure_bar < 70:
            alerts.append(f"Air's getting down to {int(pressure_bar)} bar. Start thinking about your turnaround.")

    # ── Depth Checks ──
    if depth is not None:
        if depth > 30:
            alerts.append(f"You're at {depth:.0f} meters — that's pushing the recreational limit. Keep an eye on your NDL.")
        elif depth > 18:
            alerts.append(f"Sitting at {depth:.0f} meters. Moderate depth — just keep tabs on your air and NDL.")

        # Ambient pressure calculation
        m["ambient_atm"] = round(1 + depth / 10, 2)

        # Safety stop reminder (ascending from > 10m)
        if _last_reading:
            prev_d = _last_reading.get("depth_m")
            if prev_d and prev_d > 10 and depth <= 6 and depth >= 3:
                m["safety_stop_needed"] = True

    # ── Temperature / Hypothermia Checks ──
    if temp_c is not None:
        if temp_c < 10:
            alerts.append(f"Water's at {temp_c}°C — that's seriously cold. Watch for shivering or numbness, and consider ending the dive.")
        elif temp_c < 20:
            alerts.append(f"Water's a bit chilly at {temp_c}°C. Stay aware of how you're feeling.")

        # Thermocline detection
        if _last_reading and _last_reading.get("temp_c") is not None:
            temp_delta = abs(temp_c - _last_reading["temp_c"])
            if temp_delta > 3:
                m["thermocline_detected"] = True

    # ── Oxygen Toxicity Checks ──
    if cns_percent is not None:
        if cns_percent > 100:
            alerts.append(f"Your CNS is over {cns_percent}% — that's past the oxygen toxicity limit. Ascend now and get shallower.")
        elif cns_percent > 80:
            alerts.append(f"CNS is at {cns_percent}%. Oxygen loading's getting high — think about moving shallower.")

    if po2 is not None:
        if po2 > 1.6:
            alerts.append(f"PO2 is at {po2} — that's dangerously high. Get shallower right now.")
        elif po2 > 1.4:
            alerts.append(f"PO2's sitting at {po2}. Keep an eye out for any tingling or visual changes.")

    # ── NDL (No-Decompression Limit) Checks ──
    if ndl_min is not None:
        if ndl_min <= 0:
            alerts.append("Your NDL's hit zero. Time to head up — no more bottom time.")
        elif ndl_min < 5:
            alerts.append(f"Only {ndl_min} minutes of NDL left. Start wrapping up the dive.")
        elif ndl_min < 10:
            alerts.append(f"NDL's down to {ndl_min} minutes. Keep that in mind as you go.")

    if alerts:
        # Pick the most critical alert based on urgency keywords
        def _severity(alert: str) -> int:
            a = alert.lower()
            if any(k in a for k in ("right now", "head up", "heading up now", "way too fast", "hit zero", "past the")):
                return 3
            if any(k in a for k in ("turn the dive", "wrapping up", "pushing the", "seriously cold")):
                return 2
            return 1

        alerts.sort(key=_severity, reverse=True)
        worst = alerts[0]
        is_critical = _severity(worst) >= 2
        return AgentOutput(
            agent="safety",
            type="hazard",
            content=worst,
            priority=10 if is_critical else 7,
            metadata={**m, "alert_level": "critical" if is_critical else "warning", "all_alerts": alerts},
        )

    # Update metadata with calculated fields even if no alerts
    if m != output.metadata:
        return AgentOutput(
            agent=output.agent,
            type=output.type,
            content=output.content,
            priority=output.priority,
            metadata=m,
        )

    return output


def get_last_reading() -> dict | None:
    """Return the most recent gauge reading."""
    return _last_reading
