import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api import admin, auth, misc, packages, users, wallet
from app.config import settings
from app.database import SessionLocal
from app.models.platform import Setting
from app.services.settle import settle_matured

limiter = Limiter(key_func=get_remote_address)


async def _settlement_loop():
    """Settle matured investments every 60 seconds."""
    while True:
        try:
            db = SessionLocal()
            try:
                settle_matured(db)
            finally:
                db.close()
        except Exception:
            pass  # next tick retries
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_settlement_loop())
    yield
    task.cancel()


app = FastAPI(
    title=settings.PLATFORM_NAME,
    version="0.1.0",
    # API schema/docs expose the whole attack surface — dev only.
    docs_url="/docs" if settings.is_dev else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.is_dev else None,
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # Localhost origins exist only for local dev — never in production.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$" if settings.is_dev else None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)


MAINTENANCE_ALLOWED = ("/api/config", "/api/health", "/api/auth", "/api/admin", "/health", "/docs", "/openapi.json", "/uploads")


@app.middleware("http")
async def maintenance_gate(request, call_next):
    if request.url.path.startswith("/api") and not request.url.path.startswith(MAINTENANCE_ALLOWED):
        db = SessionLocal()
        try:
            row = db.get(Setting, "platform")
        finally:
            db.close()
        if row and (row.value or {}).get("maintenance_mode"):
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Platform under maintenance"}, status_code=503)
    return await call_next(request)


@app.middleware("http")
async def security_headers(request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return resp


Path("uploads").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(wallet.router, prefix="/api")
app.include_router(packages.router, prefix="/api")
app.include_router(misc.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
