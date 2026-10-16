import asyncio
import pytest
from app import ai_coach
from app.schemas import CoachPayload

def payload(**extra):
    value = {"exerciseId":"sa-sustain", "locale":"en", "metrics":{"reliableFrameCount":42,"totalFrameCount":54,"reliablePitchMatchPercent":81,"medianAbsoluteCents":18}}
    value.update(extra)
    return CoachPayload.model_validate(value)

def test_disabled_provider_is_deterministic(monkeypatch):
    monkeypatch.setattr(ai_coach, "AI_PROVIDER", "disabled")
    result = asyncio.run(ai_coach.coach(payload()))
    assert result["source"] == "deterministic"
    assert "api" not in str(result).lower()

def test_unknown_and_raw_fields_are_rejected():
    with pytest.raises(Exception): CoachPayload.model_validate({"exerciseId":"sa-sustain","metrics":{"reliableFrameCount":1},"pcm":"x"})
    with pytest.raises(Exception): CoachPayload.model_validate({"exerciseId":"sa-sustain","metrics":{"reliableFrameCount":1,"unknown":2}})
    with pytest.raises(Exception): CoachPayload.model_validate({"exerciseId":"unknown","metrics":{"reliableFrameCount":1}})

def test_valid_mocked_gemini_response(monkeypatch):
    monkeypatch.setattr(ai_coach, "AI_PROVIDER", "gemini")
    async def mocked(_):
        return {"messageKey":"recommendations.stablePerformance","reasonKey":"recommendations.stablePerformance","confidence":"medium","evidence":{"metric":"reliablePitchMatchPercent","value":81}}
    monkeypatch.setattr(ai_coach, "generate", mocked)
    result = asyncio.run(ai_coach.coach(payload()))
    assert result["source"] == "gemini"
    assert result["evidence"]["value"] == 81

@pytest.mark.parametrize("response", [
    '{"messageKey":"unknown.key"}',
    '{"messageKey":"recommendations.stablePerformance","evidence":{"metric":"reliablePitchMatchPercent","value":2}}',
    '{"messageKey":"recommendations.stablePerformance","reasonKey":"medical diagnosis"}',
    '{"messageKey":"recommendations.stablePerformance","nextExerciseId":"unknown"}',
])
def test_invalid_gemini_response_falls_back(monkeypatch, response):
    monkeypatch.setattr(ai_coach, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(ai_coach, "generate", lambda _: response)
    result = asyncio.run(ai_coach.coach(payload()))
    assert result["source"] == "deterministic-fallback"

def test_provider_failure_falls_back(monkeypatch):
    monkeypatch.setattr(ai_coach, "AI_PROVIDER", "gemini")
    def fail(_): raise TimeoutError("provider timeout")
    monkeypatch.setattr(ai_coach, "generate", fail)
    assert asyncio.run(ai_coach.coach(payload()))["source"] == "deterministic-fallback"
