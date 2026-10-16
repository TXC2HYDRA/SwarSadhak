import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/swar_sadhak.db")
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
