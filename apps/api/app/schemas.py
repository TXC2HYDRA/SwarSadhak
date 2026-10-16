from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from math import isfinite
from typing import Any, Literal
EXERCISES = {"sa-sustain", "pitch-match", "sa-re-ga", "ascending-sargam"}
LOCALES = {"en", "hi", "mr"}
MESSAGE_KEYS = {"recommendations.stablePerformance", "recommendations.noReliableAudio", "recommendations.clipping", "recommendations.highDeviation"}
class CoachMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reliableFrameCount: int = Field(ge=0, le=4096)
    totalFrameCount: int = Field(default=0, ge=0, le=4096)
    reliablePitchMatchPercent: float | None = Field(default=None, ge=0, le=100)
    medianAbsoluteCents: float | None = Field(default=None, ge=0, le=1200)
    pitchStabilityCents: float | None = Field(default=None, ge=0, le=1200)
    minFrequencyHz: float | None = Field(default=None, ge=20, le=20000)
    maxFrequencyHz: float | None = Field(default=None, ge=20, le=20000)
    clippedFrameCount: int | None = Field(default=None, ge=0, le=4096)
    lowConfidenceFrameCount: int | None = Field(default=None, ge=0, le=4096)
    invalidFrameCount: int | None = Field(default=None, ge=0, le=4096)
    @model_validator(mode="after")
    def finite(self):
        for value in self.model_dump().values():
            if isinstance(value, float) and not isfinite(value): raise ValueError("metrics must be finite")
        return self
class CoachInputEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: str
    value: int | float | None
    threshold: int | float | None = None
class CoachPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exerciseId: str
    locale: str = "en"
    metrics: CoachMetrics
    class Quality(BaseModel):
        model_config = ConfigDict(extra="forbid")
        reliableRatio: float | None = Field(default=None, ge=0, le=1)
        silenceFrameCount: int | None = Field(default=None, ge=0, le=4096)
        lowConfidenceFrameCount: int | None = Field(default=None, ge=0, le=4096)
        clippedFrameCount: int | None = Field(default=None, ge=0, le=4096)
        invalidFrameCount: int | None = Field(default=None, ge=0, le=4096)
    class Recommendation(BaseModel):
        model_config = ConfigDict(extra="forbid")
        exerciseId: str
        reasonKey: str
        evidence: CoachInputEvidence | None = None
        @field_validator("exerciseId")
        @classmethod
        def recommendation_exercise(cls, v):
            if v not in EXERCISES: raise ValueError("unknown recommendation exercise id")
            return v
        @field_validator("reasonKey")
        @classmethod
        def recommendation_key(cls, v):
            if v not in MESSAGE_KEYS: raise ValueError("invalid recommendation key")
            return v
    quality: Quality | None = None
    recommendation: Recommendation | None = None
    @model_validator(mode="after")
    def bounded_payload(self):
        if len(self.model_dump_json()) > 16_384: raise ValueError("coach payload too large")
        return self
    @field_validator("exerciseId")
    @classmethod
    def exercise(cls, v):
        if v not in EXERCISES: raise ValueError("unknown exercise id")
        return v
    @field_validator("locale")
    @classmethod
    def locale_code(cls, v):
        if v not in LOCALES: raise ValueError("unsupported locale")
        return v
class CoachEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: str
    value: int | float | None
class CoachOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messageKey: str
    reasonKey: str | None = None
    nextExerciseId: str | None = None
    confidence: Literal["low", "medium", "high"] | None = None
    evidence: CoachEvidence | None = None
    @field_validator("nextExerciseId")
    @classmethod
    def canonical_exercise(cls, v):
        if v is not None and v not in EXERCISES: raise ValueError("unknown exercise id")
        return v
    @field_validator("messageKey", "reasonKey")
    @classmethod
    def safe_key(cls, v):
        if v is not None and v not in MESSAGE_KEYS: raise ValueError("invalid message key")
        return v
    @model_validator(mode="after")
    def safe_output(self):
        if self.reasonKey and self.reasonKey != self.messageKey: raise ValueError("reason key mismatch")
        return self
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
