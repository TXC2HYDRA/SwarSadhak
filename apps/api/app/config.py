import os
from pathlib import Path

# Optional apps/api/.env (KEY=VALUE lines). Real environment variables win.
_env = Path(__file__).parents[1] / ".env"
if _env.exists():
    for _line in _env.read_text().splitlines():
        _key, _sep, _value = _line.partition("=")
        if _sep and not _line.lstrip().startswith("#"): os.environ.setdefault(_key.strip(), _value.strip())

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/swar_sadhak.db")
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8020"))
AUTH_MODE = os.getenv("AUTH_MODE", "local")
AUTH_SECRET = os.getenv("AUTH_SECRET", "local-development-secret-change-me")
if AUTH_MODE != "local" and AUTH_SECRET == "local-development-secret-change-me":
    raise RuntimeError("AUTH_SECRET must be configured when AUTH_MODE is not local")
CORS_ORIGINS = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if x.strip()]
API_VERSION = "0.1.0"
AI_PROVIDER = os.getenv("AI_PROVIDER", "disabled")
AI_BASE_URL = os.getenv("AI_BASE_URL", "")
AI_MODEL = os.getenv("AI_MODEL", "gemini-2.5-flash-lite")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_TIMEOUT_MS = int(os.getenv("AI_TIMEOUT_MS", "8000"))
# Optional Cloudflare R2 (S3-compatible) storage for assignment files. Empty = uploads disabled.
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.getenv("R2_BUCKET", "")
# Where assignment files live. "local" keeps them on this server's disk behind the same
# presigned-URL protocol as R2, so switching is configuration only. Default: r2 when configured.
STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "r2" if all((R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)) else "local")
STORAGE_DIR = os.getenv("STORAGE_DIR", "data/storage")  # relative paths resolve against apps/, like DATABASE_URL
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", f"http://localhost:{API_PORT}")  # base URL browsers use to reach this API
