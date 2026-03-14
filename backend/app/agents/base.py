import json
import logging
from google import genai
from app.config import GEMINI_API_KEY
from app.models.messages import AgentOutput

logger = logging.getLogger(__name__)

_client = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


async def call_gemini(system_prompt: str, image_b64: str, user_text: str) -> dict:
    """Shared helper: sends an image + text to Gemini Vision and parses the JSON response."""
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
    )

    text = response.text.strip()
    # Strip markdown code fences
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3].strip()

    return json.loads(text)
