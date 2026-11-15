"""Private object storage through presigned URLs only, with two interchangeable backends:
- "r2": Cloudflare R2's S3 API. Browsers upload and download directly with short-lived URLs.
- "local": files on this server's disk, served by routers/local_storage.py with the same
  path-style URLs, SigV4 query signatures, expiry, PUT/GET/HEAD/DELETE and byte ranges.
The rest of the app cannot tell them apart, so moving to R2 is configuration only.
SigV4 signing uses the standard library, so no SDK dependency is needed."""
import hashlib, hmac
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
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

def backend(): return config.STORAGE_BACKEND

def enabled():
    if backend() == "local": return True
    return backend() == "r2" and all((config.R2_ACCOUNT_ID, config.R2_ACCESS_KEY_ID, config.R2_SECRET_ACCESS_KEY, config.R2_BUCKET))

def bucket(): return config.R2_BUCKET or "nadopasana"

def _target():
    """(scheme, host, path prefix, access key, secret, region) that presigned URLs point at."""
    if backend() == "local":
        url = urlparse(config.API_PUBLIC_URL)
        secret = hmac.new(config.AUTH_SECRET.encode(), b"nadopasana-local-storage", hashlib.sha256).hexdigest()
        return url.scheme or "http", url.netloc, "/storage", "local", secret, "auto"
    return "https", f"{config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com", "", config.R2_ACCESS_KEY_ID, config.R2_SECRET_ACCESS_KEY, "auto"

def _enc(value): return quote(str(value), safe="-_.~")

def sign_url(method, host, path, access_key, secret_key, region, expires, now, query=None, headers=None, scheme="https"):
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
    return f"{scheme}://{host}{quote(path, safe='/-_.~')}?{canonical_query}&X-Amz-Signature={signature}"

def presign(method, key, expires, query=None, headers=None):
    if not enabled(): raise StorageError("file storage is not configured")
    scheme, host, prefix, access, secret, region = _target()
    return sign_url(method, host, f"{prefix}/{bucket()}/{key}", access, secret, region, expires, datetime.now(timezone.utc), query, headers, scheme)

def verify(method, path, params, header, now=None):
    """Check a presigned request the way S3/R2 does: algorithm, credential, unexpired, signature.
    `params` are the decoded query parameters; `header(name)` returns a request header."""
    try:
        if params.get("X-Amz-Algorithm") != "AWS4-HMAC-SHA256": return False
        scheme, host, _, access, secret, region = _target()
        if not params.get("X-Amz-Credential", "").startswith(f"{access}/"): return False
        signed_at = datetime.strptime(params["X-Amz-Date"], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        expires, now = int(params["X-Amz-Expires"]), now or datetime.now(timezone.utc)
        if not 0 < expires <= 7 * 86400 or not signed_at - timedelta(minutes=5) <= now <= signed_at + timedelta(seconds=expires): return False
        names = params["X-Amz-SignedHeaders"].split(";")
        if "host" not in names: return False
        headers = {name: header(name) or "" for name in names if name != "host"}
        extra = {k: v for k, v in params.items() if not k.startswith("X-Amz-")}
        expected = sign_url(method, host, path, access, secret, region, expires, signed_at, extra, headers, scheme)
        return hmac.compare_digest(expected.rsplit("X-Amz-Signature=", 1)[1], params.get("X-Amz-Signature", ""))
    except (KeyError, ValueError):
        return False

# --- local backend: one file per object plus a ".type" file holding its content type ---

def storage_root():
    root = Path(config.STORAGE_DIR)
    return (root if root.is_absolute() else Path(__file__).parents[2] / root).resolve()

def local_path(key):
    root = storage_root(); path = (root / key).resolve()
    if root not in path.parents: raise StorageError("invalid object key")
    return path

def type_path(path): return path.with_name(path.name + ".type")

def _local_head(key):
    path = local_path(key)
    if not path.is_file(): return None
    content_type = type_path(path).read_text() if type_path(path).exists() else "application/octet-stream"
    return path.stat().st_size, content_type

def _local_delete(key):
    path = local_path(key)
    path.unlink(missing_ok=True); type_path(path).unlink(missing_ok=True)

def upload_url(key, content_type):
    return presign("PUT", key, UPLOAD_SECONDS, headers={"Content-Type": content_type})

def download_url(key, name, content_type):
    ascii_name = name.encode("ascii", "ignore").decode().replace('"', "").strip() or "file"
    disposition = f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"
    return presign("GET", key, DOWNLOAD_SECONDS, query={"response-content-disposition": disposition, "response-content-type": content_type})

def head(key):
    """(size, content_type) of a stored object, or None if it does not exist."""
    if backend() == "local": return _local_head(key)
    try:
        with urlopen(Request(presign("HEAD", key, 60), method="HEAD"), timeout=15) as response:
            return int(response.headers.get("Content-Length", -1)), response.headers.get("Content-Type", "")
    except HTTPError as error:
        if error.code == 404: return None
        raise StorageError(f"storage returned {error.code}")
    except URLError as error: raise StorageError(str(error.reason))

def delete(key):
    if backend() == "local": return _local_delete(key)
    try:
        with urlopen(Request(presign("DELETE", key, 60), method="DELETE"), timeout=15): pass
    except HTTPError as error:
        if error.code != 404: raise StorageError(f"storage returned {error.code}")
    except URLError as error: raise StorageError(str(error.reason))
