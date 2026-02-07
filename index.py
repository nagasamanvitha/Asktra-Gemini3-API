"""
Vercel entrypoint: single FastAPI app that serves frontend static at / and backend at /api.
If backend import fails (e.g. missing deps), /api returns 503 with error message so the app doesn't crash.
"""
import sys
import traceback
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

_root = Path(__file__).resolve().parent
_backend_dir = _root / "backend"
backend_app = None
backend_error = None

if _backend_dir.exists() and (_backend_dir / "main.py").exists():
    sys.path.insert(0, str(_backend_dir))
    try:
        from main import app as _backend_app  # noqa: E402
        backend_app = _backend_app
    except Exception as e:
        backend_error = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"

app = FastAPI(title="Asktra")

# Mount backend at /api if it loaded; otherwise add error handler
if backend_app is not None:
    app.mount("/api", backend_app)
else:
    from fastapi.responses import JSONResponse

    def _api_error():
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Backend failed to load. Check Vercel logs.",
                "error": (backend_error or "Backend not found")[:500],
            },
        )

    @app.get("/api")
    @app.get("/api/")
    def api_root_error():
        return _api_error()

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    def api_fallback(path: str):
        return _api_error()

# Serve frontend build at / (SPA: html=True so /foo -> index.html)
_dist = _root / "frontend" / "dist"
if _dist.exists() and (_dist / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
else:
    @app.get("/")
    def root():
        return {
            "service": "asktra",
            "message": "Frontend not built or not found. Run: npm run build",
            "api_status": "error" if backend_error else "ok",
        }
