from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Any, Literal
EXERCISES = {"sa-sustain", "pitch-match", "sa-re-ga", "ascending-sargam"}
class UserCreate(BaseModel): username: str = Field(min_length=2, max_length=80); password: str = Field(min_length=8); display_name: str = Field(min_length=1, max_length=120); role: Literal["student", "teacher"] = "student"
class Login(BaseModel): username: str; password: str
class Practice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120); exercise_id: str; tonic_frequency: float = Field(gt=20, lt=2000); started_at: datetime; ended_at: datetime | None = None; duration_seconds: float = Field(ge=0, le=3600); reliable_frame_count: int = Field(ge=0, le=1000000); total_frame_count: int = Field(ge=0, le=1000000); reliable_pitch_match_percent: float | None = Field(default=None, ge=0, le=100); median_absolute_cents: float | None = Field(default=None, ge=0, le=1200); pitch_stability_cents: float | None = Field(default=None, ge=0, le=1200); min_frequency_hz: float | None = Field(default=None, gt=0, lt=2000); max_frequency_hz: float | None = Field(default=None, gt=0, lt=2000); quality: dict[str, Any] = {}; completion: dict[str, Any] = {}; source: str = "browser-derived"
    @field_validator("exercise_id")
    @classmethod
    def valid_exercise(cls, v):
        if v not in EXERCISES: raise ValueError("unknown exercise id")
        return v
class Routine(BaseModel): id: str; name: str = Field(min_length=1, max_length=120); description: str = Field(default="", max_length=500); routine: dict[str, Any]
class AssignmentCreate(BaseModel): student_id: str; routine_id: str; title: str = Field(min_length=1, max_length=120); instructions: str = Field(default="", max_length=2000); due_at: datetime | None = None
class AssignmentUpdate(BaseModel):
    status: Literal["assigned", "in_progress", "completed", "cancelled"] | None = None
