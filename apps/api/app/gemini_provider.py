import json, urllib.request
from .config import AI_API_KEY, AI_MODEL, AI_TIMEOUT_MS

MAX_BODY = 16_384
def _http(request, timeout):
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(32_768)

def _request(payload, http_fn=_http):
    body = json.dumps({"contents": [{"parts": [{"text": json.dumps(payload, separators=(',', ':'))}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": {"type": "OBJECT",
            "properties": {"messageKey": {"type": "STRING"}, "reasonKey": {"type": "STRING"},
                            "nextExerciseId": {"type": "STRING"}, "confidence": {"type": "STRING"},
                            "evidence": {"type": "OBJECT"}}}}}, separators=(',', ':')).encode()
    if len(body) > MAX_BODY: raise ValueError("payload too large")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{AI_MODEL}:generateContent"
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type":"application/json", "x-goog-api-key": AI_API_KEY})
    raw = http_fn(req, max(1, min(AI_TIMEOUT_MS, 30_000)) / 1000)
    if len(raw) > 32_768: raise ValueError("response too large")
    response = json.loads(raw)
    return response["candidates"][0]["content"]["parts"][0]["text"]

def generate(payload, http_fn=_http):
    return _request(payload, http_fn)
