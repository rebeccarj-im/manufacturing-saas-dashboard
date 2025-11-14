from pydantic import BaseModel, Field
from typing import Literal

Level = Literal["info", "warning", "critical"]

class Alert(BaseModel):
    id: str
    level: Level
    message: str
    created_at: str = Field(description="ISO datetime")
