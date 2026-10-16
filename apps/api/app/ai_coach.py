import asyncio, json, re
from .config import AI_PROVIDER
from .schemas import CoachPayload, CoachOutput
from .gemini_provider import generate

UNSAFE = re.compile(r"<\s*(script|iframe|object)|javascript:|data:text/html|https?://|\b(?:diagnos(?:e|is|tic)|medical|disease|condition|prescription|treatment)\b", re.I)
EVIDENCE_METRICS = {"reliableFrameCount", "totalFrameCount", "reliablePitchMatchPercent", "medianAbsoluteCents", "pitchStabilityCents", "minFrequencyHz", "maxFrequencyHz", "clippedFrameCount", "lowConfidenceFrameCount", "invalidFrameCount"}

def _fallback(p: CoachPayload):
    m = p.metrics
    key = "recommendations.stablePerformance"
    metric, value = "reliableFrameCount", m.reliableFrameCount
    if not m.reliableFrameCount: key = "recommendations.noReliableAudio"
    elif m.clippedFrameCount: key, metric, value = "recommendations.clipping", "clippedFrameCount", m.clippedFrameCount
    elif (m.medianAbsoluteCents or 0) > 50: key, metric, value = "recommendations.highDeviation", "medianAbsoluteCents", m.medianAbsoluteCents
    return {"exerciseId": p.exerciseId, "locale": p.locale, "messageKey": key, "reasonKey": key,
            "evidence": {"metric": metric, "value": value}, "source": "deterministic"}

async def coach(payload: CoachPayload):
    fallback = _fallback(payload)
    if AI_PROVIDER != "gemini": return fallback
    try:
        candidate = await generate(payload.model_dump(mode="json"))
        if isinstance(candidate, str): candidate = json.loads(candidate)
        if UNSAFE.search(json.dumps(candidate, ensure_ascii=False)): raise ValueError("unsafe output")
        out = CoachOutput.model_validate(candidate)
        data = out.model_dump(exclude_none=True)
        if out.evidence is not None:
            metrics = payload.metrics.model_dump()
            if out.evidence.metric not in EVIDENCE_METRICS or out.evidence.metric not in metrics or metrics[out.evidence.metric] != out.evidence.value: raise ValueError("evidence mismatch")
        return {**data, "source": "gemini"}
    except Exception:
        return {**fallback, "source": "deterministic-fallback"}
