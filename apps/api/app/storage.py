"""Private object storage on Cloudflare R2 through its S3 API, using presigned URLs only.
Browsers upload and download directly with short-lived URLs; the API never proxies file bytes.
SigV4 query signing is done with the standard library, so no SDK dependency is needed."""
import hashlib, hmac
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from . import config

MB = 1024 * 1024
# Allowed upload types and their size limits.
TYPES = {
    **dict.fromkeys(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/webm", "audio/wav", "audio/x-wav"], ("audio", 25 * MB)),
    **dict.fromkeys(["video/mp4", "video/webm", "video/quicktime"], ("video", 300 * MB)),
    "application/pdf": ("pdf", 20 * MB),
    **dict.fromkeys(["image/jpeg", "image/png", "image/webp"], ("image", 10 * MB)),
}
UPLOAD_SECONDS = 15 * 60   # long enough to start a 300 MB upload on a slow connection
DOWNLOAD_SECONDS = 60 * 60  # long enough to watch a video with seeking

class StorageError(Exception): pass

def enabled():
    return all((config.R2_ACCOUNT_ID, config.R2_ACCESS_KEY_ID, config.R2_SECRET_ACCESS_KEY, config.R2_BUCKET))

def _enc(value): return quote(str(value), safe="-_.~")

def sign_url(method, host, path, access_key, secret_key, region, expires, now, query=None, headers=None):
    """AWS SigV4 presigned URL (query authentication). `headers` are signed and must be sent as given."""
    amz_date, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    scope = f"{day}/{region}/s3/aws4_request"
    signed = {"host": host, **{k.lower(): v for k, v in (headers or {}).items()}}
    names = ";".join(sorted(signed))
    params = {**(query or {}), "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": f"{access_key}/{scope}",
              "X-Amz-Date": amz_date, "X-Amz-Expires": str(expires), "X-Amz-SignedHeaders": names}
    canonical_query = "&".join(f"{_enc(k)}={_enc(v)}" for k, v in sorted(params.items()))
    canonical = "\n".join([method, quote(path, safe="/-_.~"), canonical_query,
                           "".join(f"{k}:{signed[k].strip()}\n" for k in sorted(signed)), names, "UNSIGNED-PAYLOAD"])
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    key = ("AWS4" + secret_key).encode()
    for part in (day, region, "s3", "aws4_request"): key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    return f"https://{host}{quote(path, safe='/-_.~')}?{canonical_query}&X-Amz-Signature={signature}"

def presign(method, key, expires, query=None, headers=None):
    if not enabled(): raise StorageError("file storage is not configured")
    return sign_url(method, f"{config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com", f"/{config.R2_BUCKET}/{key}",
                    config.R2_ACCESS_KEY_ID, config.R2_SECRET_ACCESS_KEY, "auto", expires, datetime.now(timezone.utc), query, headers)

def upload_url(key, content_type):
    return presign("PUT", key, UPLOAD_SECONDS, headers={"Content-Type": content_type})

def download_url(key, name, content_type):
    ascii_name = name.encode("ascii", "ignore").decode().replace('"', "") or "file"
    disposition = f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"
    return presign("GET", key, DOWNLOAD_SECONDS, query={"response-content-disposition": disposition, "response-content-type": content_type})

def head(key):
    """(size, content_type) of a stored object, or None if it does not exist."""
    try:
        with urlopen(Request(presign("HEAD", key, 60), method="HEAD"), timeout=15) as response:
            return int(response.headers.get("Content-Length", -1)), response.headers.get("Content-Type", "")
    except HTTPError as error:
        if error.code == 404: return None
        raise StorageError(f"storage returned {error.code}")
    except URLError as error: raise StorageError(str(error.reason))

def delete(key):
    try:
        with urlopen(Request(presign("DELETE", key, 60), method="DELETE"), timeout=15): pass
    except HTTPError as error:
        if error.code != 404: raise StorageError(f"storage returned {error.code}")
    except URLError as error: raise StorageError(str(error.reason))
