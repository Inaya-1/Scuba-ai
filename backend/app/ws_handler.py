import json
import base64
import logging
from google import genai
from app.config import GEMINI_API_KEY
from app.prompts.system import SYSTEM_PROMPT
from app.models.messages import AgentOutput

logger = logging.getLogger(__name__)

client = None


def get_client():
    global client
    if client is None:
        client = genai.Client(api_key=GEMINI_API_KEY)
    return client


async def handle_frame(payload: str, metadata: dict) -> dict:
    """Process a camera frame through Gemini Vision and return an AgentOutput dict."""
    try:
        c = get_client()

        image_bytes = base64.b64decode(payload)

        response = c.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                {
                    "role": "user",
                    "parts": [
                        {"text": SYSTEM_PROMPT},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": payload,
                            }
                        },
                        {"text": "Analyze this image and respond with the JSON format specified."},
                    ],
                }
            ],
        )

        text = response.text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3].strip()

        result = json.loads(text)
        output = AgentOutput(**result)
        return output.model_dump()

    except json.JSONDecodeError as e:
        logger.warning(f"Gemini returned non-JSON: {e}")
        return AgentOutput(
            agent="manager",
            type="info",
            content=text if 'text' in dir() else "Could not parse response",
            priority=1,
        ).model_dump()

    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        return AgentOutput(
            agent="manager",
            type="info",
            content=f"Analysis unavailable: {str(e)[:100]}",
            priority=0,
        ).model_dump()


async def handle_map_upload(payload: str, metadata: dict) -> dict:
    """Process a map image upload."""
    try:
        c = get_client()

        response = c.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                {
                    "role": "user",
                    "parts": [
                        {"text": "You are Scuba.ai, a dive navigation assistant. Analyze this hand-drawn dive site map. Identify landmarks, entry/exit points, and suggest a route. Respond ONLY with JSON: {\"agent\": \"nav\", \"type\": \"navigation\", \"content\": \"your analysis\", \"priority\": 5, \"metadata\": {\"landmarks\": [], \"entry_point\": \"\", \"exit_point\": \"\"}}"},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": payload,
                            }
                        },
                    ],
                }
            ],
        )

        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3].strip()

        result = json.loads(text)
        output = AgentOutput(**result)
        return output.model_dump()

    except Exception as e:
        logger.error(f"Map analysis error: {e}")
        return AgentOutput(
            agent="nav",
            type="navigation",
            content=f"Could not analyze map: {str(e)[:100]}",
            priority=0,
        ).model_dump()
