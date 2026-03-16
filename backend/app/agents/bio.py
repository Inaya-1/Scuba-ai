import logging
import time
from app.agents.base import call_gemini
from app.prompts.bio import BIO_PROMPT
from app.models.messages import AgentOutput

logger = logging.getLogger(__name__)

# Session history of identified species
_species_log: list[dict] = []

# All species identified this session (names only, for dedup context)
_identified_names: list[str] = []


def _get_recent_species_context() -> str:
    """Build context of species identified this session so Gemini uses consistent names."""
    if not _identified_names:
        return ""
    # Deduplicate, most recent first
    unique = list(dict.fromkeys(reversed(_identified_names)))[:15]
    return (
        f" Previously identified species this dive: {', '.join(unique)}."
        " If you see any of these species again, use the EXACT SAME common_name as listed above for consistency."
    )


def _record_species(name: str):
    """Record a species as identified this session."""
    _identified_names.append(name)


async def handle_identify(payload: str, metadata: dict) -> dict:
    """Identify marine life in the current frame (triggered by user tap or voice)."""
    try:
        prompt = metadata.get("prompt", "")
        user_text = "The diver is asking: 'What is this?' — identify the most prominent marine life in this image."
        if prompt:
            user_text = f"The diver asks: '{prompt}'. Identify the relevant marine life."

        result = await call_gemini(BIO_PROMPT, payload, user_text)
        output = AgentOutput(**result)

        # Low-confidence fallback
        confidence = (output.metadata or {}).get("confidence", 1.0)
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = 1.0

        if confidence < 0.4:
            output = AgentOutput(
                agent="bio",
                type="info",
                content="I can't confidently identify this — try getting closer or a clearer angle.",
                priority=1,
                metadata={**(output.metadata or {}), "confidence": confidence},
            )
        elif output.metadata:
            _species_log.append(output.metadata)
            cname = output.metadata.get("common_name", "")
            if cname:
                _record_species(cname)

        return output.model_dump()
    except Exception as e:
        logger.error(f"BioAgent identify error: {e}")
        return AgentOutput(
            agent="bio",
            type="species",
            content=f"Could not identify species: {str(e)[:100]}",
            priority=1,
        ).model_dump()


async def handle_bio_frame(payload: str, metadata: dict) -> dict:
    """Passive scan of a frame for notable marine life (background monitoring)."""
    try:
        recent_ctx = _get_recent_species_context()
        user_text = (
            "Scan this underwater scene. If you see any notable, dangerous, or interesting marine life, identify it."
            " If nothing notable, respond with type 'info' and a brief scene note."
            f"{recent_ctx}"
        )
        result = await call_gemini(BIO_PROMPT, payload, user_text)
        output = AgentOutput(**result)

        # Low-confidence: don't log or alert
        confidence = (output.metadata or {}).get("confidence", 1.0)
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = 1.0

        if confidence < 0.4:
            return AgentOutput(
                agent="bio",
                type="info",
                content="Scanning...",
                priority=0,
                metadata={"confidence": confidence},
            ).model_dump()

        if output.type == "species" and output.metadata:
            _species_log.append(output.metadata)
            # Record for dedup context on next frame
            cname = output.metadata.get("common_name", "")
            if cname:
                _record_species(cname)

        return output.model_dump()
    except Exception as e:
        logger.error(f"BioAgent frame error: {e}")
        return AgentOutput(
            agent="bio",
            type="info",
            content=f"Bio scan unavailable: {str(e)[:100]}",
            priority=0,
        ).model_dump()


def get_species_log() -> list[dict]:
    """Return all species identified this session."""
    return _species_log
