"""
Vercel entrypoint: serve FastAPI app under /api so frontend at / can call /api/ask, etc.
Vercel looks for an 'app' in api/main.py; static frontend is served from frontend/dist at /.
"""
import sys
from pathlib import Path

from fastapi import FastAPI

# Run from repo root; add backend so "main" resolves to backend/main.py
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "backend"))

from main import app as backend_app  # noqa: E402

# Mount backend at /api so Vercel routes /api/* to this function and paths are /api/health, /api/ask, etc.
app = FastAPI(title="Asktra API")
app.mount("/api", backend_app)
