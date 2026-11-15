# syntax=docker/dockerfile:1
# NadoPasana API. Build from the repository root: docker build -f apps/api/Dockerfile .
FROM python:3.11.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/apps/api
COPY apps/api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/api ./
RUN python -m pytest -q tests && rm -rf .pytest_cache
# The database and stored files live in /app/apps/data; mount a volume there to keep them.
RUN useradd --create-home --uid 10001 app && mkdir -p /app/apps/data && chown app:app /app/apps/data
USER app
EXPOSE 8020
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8020/api/health', timeout=4)"
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8020"]
