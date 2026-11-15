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
Role = Literal["owner", "teacher", "student"]
def unique_roles(roles):
    if roles is not None and len(set(roles)) != len(roles): raise ValueError("roles must be unique")
    return roles
class OwnerUserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=2, max_length=80, pattern=r"^[A-Za-z0-9._-]+$"); password: str = Field(min_length=8, max_length=200); display_name: str = Field(min_length=1, max_length=120); roles: list[Role] = Field(min_length=1, max_length=3)
    @field_validator("roles")
    @classmethod
    def roles_unique(cls, v): return unique_roles(v)
class OwnerUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str | None = Field(default=None, min_length=1, max_length=120); password: str | None = Field(default=None, min_length=8, max_length=200); roles: list[Role] | None = Field(default=None, min_length=1, max_length=3); active: bool | None = None
    @field_validator("roles")
    @classmethod
    def roles_unique(cls, v): return unique_roles(v)
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
class CourseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120); description: str = Field(default="", max_length=1000)
class CourseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=120); description: str | None = Field(default=None, max_length=1000); active: bool | None = None
class CourseTeachers(BaseModel):
    model_config = ConfigDict(extra="forbid")
    teacher_ids: list[str] = Field(max_length=200)
class EnrollmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str; course_id: str; teacher_id: str
class EnrollmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["active", "paused", "ended"] | None = None; teacher_id: str | None = None
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
Day = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
TIME_PATTERN = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"
class BatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120); course_id: str; start_time: str = Field(pattern=TIME_PATTERN); end_time: str = Field(pattern=TIME_PATTERN)
    days: list[Day] = Field(min_length=1, max_length=7); student_ids: list[str] = Field(default=[], max_length=200)
class BatchUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=120); course_id: str | None = None
    start_time: str | None = Field(default=None, pattern=TIME_PATTERN); end_time: str | None = Field(default=None, pattern=TIME_PATTERN)
    days: list[Day] | None = Field(default=None, min_length=1, max_length=7); student_ids: list[str] | None = Field(default=None, max_length=200)
    status: Literal["active", "paused"] | None = None

class RiyazAssignmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=160); instructions: str = Field(default="", max_length=4000); course_id: str
    due_on: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"); student_ids: list[str] = Field(min_length=1, max_length=200)
class RiyazAssignmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=160); instructions: str | None = Field(default=None, max_length=4000)
    due_on: str | None = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2})?$"); student_ids: list[str] | None = Field(default=None, min_length=1, max_length=200)
class SubmissionSave(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str = Field(default="", max_length=4000); status: Literal["draft", "submitted"]
class SubmissionReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feedback: str = Field(max_length=4000); reviewed: bool = True
class AttachmentParent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assignment_id: str | None = None; submission_id: str | None = None
    @model_validator(mode="after")
    def one_parent(self):
        if (self.assignment_id is None) == (self.submission_id is None): raise ValueError("give exactly one of assignment_id or submission_id")
        return self
class UploadStart(AttachmentParent):
    name: str = Field(min_length=1, max_length=200); content_type: str = Field(max_length=100); size: int = Field(gt=0)
class LinkCreate(AttachmentParent):
    url: str = Field(pattern=r"^https://[^\s]+$", max_length=2000); name: str = Field(default="", max_length=200)
