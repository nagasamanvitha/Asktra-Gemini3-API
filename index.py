"""
Vercel entrypoint: single FastAPI app that serves frontend static files at / and backend at /api.
Vercel uses this file at repo root so all requests (/, /api/*) go to one handler — no api/ folder routing.
"""
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# Backend app from backend/main.py
_root = Path(__file__).resolve().parent
sys.path.insert(0, str(_root / "backend"))
from main import app as backend_app  # noqa: E402

app = FastAPI(title="Asktra")

# Order matters: mount /api first so /api/* goes to backend
app.mount("/api", backend_app)

# Then serve frontend build at / (SPA: html=True so /foo -> index.html)
_dist = _root / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
else:
    # Fallback if frontend not built (e.g. local run without npm run build)
    @app.get("/")
    def root():
        return {"message": "Frontend not built. Run: npm run build"}
