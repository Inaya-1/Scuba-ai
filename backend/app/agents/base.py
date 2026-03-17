import asyncio
import json
import logging
import re
from google import genai
from google.genai.types import GenerateContentConfig, ThinkingConfig
from app.config import GEMINI_API_KEY
from app.models.messages import AgentOutput

logger = logging.getLogger(__name__)

_client = None

# Timeout for each Gemini API call (seconds). Prevents hung threads.
GEMINI_TIMEOUT_S = 30


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def _sync_generate(system_prompt: str, image_b64: str, user_text: str) -> str:
    """Synchronous Gemini call — runs in a thread pool to avoid blocking the event loop."""
    c = get_client()
    response = c.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            {
                "role": "user",
                "parts": [
                    {"text": system_prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": image_b64,
                        }
                    },
                    {"text": user_text},
                ],
            }
        ],
        config=GenerateContentConfig(
            thinking_config=ThinkingConfig(thinking_budget=0),
        ),
    )
    return response.text


def _extract_json(text: str) -> dict:
    """Robustly extract JSON from Gemini's response, handling markdown fences and extra text."""
    text = text.strip()

    # Strip markdown code fences
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3].strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fallback: find the first {...} block in the response
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Nothing parseable — raise with context
    raise ValueError(f"No valid JSON in Gemini response: {text[:200]}")


async def call_gemini(system_prompt: str, image_b64: str, user_text: str) -> dict:
    """Shared helper: sends an image + text to Gemini Vision and parses the JSON response."""
    try:
        raw = await asyncio.wait_for(
            asyncio.to_thread(_sync_generate, system_prompt, image_b64, user_text),
            timeout=GEMINI_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        raise TimeoutError(f"Gemini API call timed out after {GEMINI_TIMEOUT_S}s")

    return _extract_json(raw)
