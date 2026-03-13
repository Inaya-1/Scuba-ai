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

    # ── Ascent / Descent Rate (compare with previous reading) ──
    depth = depth_m if depth_m is not None else (depth_ft * 0.3048 if depth_ft else None)
    if _last_reading and depth is not None:
        prev_depth = _last_reading.get("depth_m")
        if prev_depth is None and _last_reading.get("depth_ft") is not None:
            prev_depth = _last_reading["depth_ft"] * 0.3048
        if prev_depth is not None:
            # Frames arrive ~6s apart
            ascent_rate = (prev_depth - depth) / 6.0 * 60  # m/min (positive = ascending)
            descent_rate = -ascent_rate  # positive = descending
            m["ascent_rate_mpm"] = round(ascent_rate, 1)

            if ascent_rate > 18:  # Max safe ascent: 18 m/min (PADI)
                alerts.append(f"CRITICAL: Ascending too fast ({ascent_rate:.0f} m/min). Slow down immediately!")
            elif ascent_rate > 10:
                alerts.append(f"Ascent rate elevated ({ascent_rate:.0f} m/min). Slow your ascent.")

            if descent_rate > 30:  # Rapid descent risk — barotrauma danger
                alerts.append(f"CRITICAL: Descending too fast ({descent_rate:.0f} m/min). Equalize and slow down!")

    # ── Air Pressure Checks ──
    pressure_bar = bar if bar is not None else (psi / 14.504 if psi else None)
    if pressure_bar is not None:
        if pressure_bar < 35:
            alerts.append("CRITICAL: Reserve pressure — begin ascent NOW")
        elif pressure_bar < 50:
            alerts.append("Turnaround pressure reached — head to exit")
        elif pressure_bar < 70:
            alerts.append("Monitor air — approaching turnaround pressure")

    # ── Depth Checks ──
    if depth is not None:
        if depth > 30:
            alerts.append("Approaching recreational depth limit (30m/100ft)")
        elif depth > 18:
            alerts.append("Moderate depth — monitor NDL and air consumption")

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
            alerts.append(f"CRITICAL: Water extremely cold ({temp_c}°C). High hypothermia risk.")
        elif temp_c < 20:
            alerts.append(f"Cool water ({temp_c}°C) — monitor for cold stress symptoms.")

        # Thermocline detection
        if _last_reading and _last_reading.get("temp_c") is not None:
            temp_delta = abs(temp_c - _last_reading["temp_c"])
            if temp_delta > 3:
                m["thermocline_detected"] = True

    # ── Oxygen Toxicity Checks ──
    if cns_percent is not None:
        if cns_percent > 100:
            alerts.append("CRITICAL: CNS oxygen toxicity limit exceeded!")
        elif cns_percent > 80:
            alerts.append(f"Oxygen toxicity loading high (CNS {cns_percent}%). Consider shallower depth.")

    if po2 is not None:
        if po2 > 1.6:
            alerts.append(f"CRITICAL: PO2 dangerously high ({po2}). Ascend immediately!")
        elif po2 > 1.4:
            alerts.append(f"Elevated PO2 ({po2}). Monitor for oxygen toxicity symptoms.")

    # ── NDL (No-Decompression Limit) Checks ──
    if ndl_min is not None:
        if ndl_min <= 0:
            alerts.append("CRITICAL: No-decompression limit reached — begin ascent now!")
        elif ndl_min < 5:
            alerts.append(f"NDL critically low ({ndl_min} min). Begin ascent soon.")
        elif ndl_min < 10:
            alerts.append(f"Approaching no-decompression limit ({ndl_min} min remaining).")

    if alerts:
        # Pick the most critical alert (CRITICAL > Turnaround > warning)
        def _severity(alert: str) -> int:
            if "CRITICAL" in alert:
                return 3
            if "Turnaround" in alert or "Reserve" in alert or "limit" in alert.lower() or "begin ascent" in alert.lower():
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
