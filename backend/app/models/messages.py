from pydantic import BaseModel
from typing import Literal


class AgentInput(BaseModel):
    type: Literal["frame", "map_upload", "identify", "gauge_read", "nav_frame"]
    payload: str
    metadata: dict = {}


class AgentOutput(BaseModel):
    agent: Literal["safety", "bio", "nav", "manager"]
    type: Literal["info", "hazard", "species", "navigation"]
    content: str
    priority: int = 0
    metadata: dict = {}
