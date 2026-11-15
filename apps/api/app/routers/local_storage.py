import re
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from .. import storage

# The local stand-in for an R2 bucket: path-style object URLs that accept only presigned
# requests (SigV4 query signature + expiry), like R2. Browsers talk to it exactly as to R2.
router = APIRouter(prefix="/storage", include_in_schema=False)
MAX_OBJECT = max(limit for _, limit in storage.TYPES.values())

def signed_object(request, bucket, key):
    if storage.backend() != "local" or bucket != storage.bucket(): raise HTTPException(404, "NoSuchBucket")
    if not storage.verify(request.method, f"/storage/{bucket}/{key}", dict(request.query_params), request.headers.get):
        raise HTTPException(403, "SignatureDoesNotMatch or request expired")
    try: return storage.local_path(key)
    except storage.StorageError: raise HTTPException(400, "InvalidObjectName")

@router.put("/{bucket}/{key:path}")
async def put_object(bucket: str, key: str, request: Request):
    path = signed_object(request, bucket, key)
    if int(request.headers.get("content-length") or 0) > MAX_OBJECT: raise HTTPException(413, "EntityTooLarge")
    path.parent.mkdir(parents=True, exist_ok=True)
    part, size = path.with_name(path.name + ".part"), 0
    # ponytail: blocking disk writes inside the event loop; fine for one local server, R2 replaces it in production.
    with part.open("wb") as out:
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_OBJECT: break
            out.write(chunk)
    if size > MAX_OBJECT:
        part.unlink(missing_ok=True); raise HTTPException(413, "EntityTooLarge")
    part.replace(path)
    storage.type_path(path).write_text(request.headers.get("content-type") or "application/octet-stream")
    return Response(status_code=200)

@router.api_route("/{bucket}/{key:path}", methods=["GET", "HEAD"])
def get_object(bucket: str, key: str, request: Request):
    path = signed_object(request, bucket, key)
    info = storage.head(key)
    if info is None: raise HTTPException(404, "NoSuchKey")
    size, params = info[0], request.query_params
    headers = {"Accept-Ranges": "bytes", "Content-Type": params.get("response-content-type") or info[1]}
    if params.get("response-content-disposition"): headers["Content-Disposition"] = params["response-content-disposition"]
    start, end, status = 0, size - 1, 200
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", request.headers.get("range", "").strip())
    if match and (match[1] or match[2]):  # byte ranges let browsers seek in audio and video
        start, end = (int(match[1]), min(int(match[2]), size - 1) if match[2] else size - 1) if match[1] else (max(size - int(match[2]), 0), size - 1)
        if start > end: return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        status, headers["Content-Range"] = 206, f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(end - start + 1)
    if request.method == "HEAD": return Response(status_code=status, headers=headers)
    def chunks():
        with path.open("rb") as source:
            source.seek(start); left = end - start + 1
            while left > 0 and (data := source.read(min(1 << 16, left))):
                left -= len(data); yield data
    return StreamingResponse(chunks(), status_code=status, headers=headers)

@router.delete("/{bucket}/{key:path}")
def delete_object(bucket: str, key: str, request: Request):
    signed_object(request, bucket, key)
    storage.delete(key)
    return Response(status_code=204)
