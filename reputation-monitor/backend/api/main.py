"""
Reputation Monitor API - FastAPI application entry point.
"""
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

logger.info("Starting Reputation Monitor API …")

from fastapi import FastAPI, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# --- Safe imports for optional dependencies ---

try:
    from slowapi.errors import RateLimitExceeded
    from api.middleware.rate_limit import limiter
    _slowapi_available = True
    logger.info("slowapi rate limiter loaded")
except Exception as exc:
    _slowapi_available = False
    logger.warning("slowapi not available – rate limiting disabled: %s", exc)

try:
    from core.config import settings
    logger.info("Settings loaded successfully")
except Exception as exc:
    logger.error("Failed to load settings: %s", exc)
    raise

app = FastAPI(
    title="Reputation Monitor API",
    description="Production-grade reputation monitoring and attack detection platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Rate limiting (optional)
if _slowapi_available:
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Max 100 req/min."},
        )

# CORS - allow all configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers – wrap each import so a single broken module doesn't crash the app
API_PREFIX = "/api/v1"

_route_modules = [
    ("api.routes.keywords", "keywords"),
    ("api.routes.sentiment", "sentiment"),
    ("api.routes.posts", "posts"),
    ("api.routes.attackers", "attackers"),
    ("api.routes.clusters", "clusters"),
    ("api.routes.scores", "scores"),
    ("api.routes.alerts", "alerts"),
    ("api.routes.reputation_os", "reputation_os"),
]

for module_path, name in _route_modules:
    try:
        mod = __import__(module_path, fromlist=["router"])
        app.include_router(mod.router, prefix=API_PREFIX)
        logger.info("Registered router: %s", name)
    except Exception as exc:
        logger.error("Failed to register router %s: %s", name, exc)

# WebSocket / live route (no prefix)
try:
    from api.routes import live
    app.include_router(live.router)
    logger.info("Registered router: live (websocket)")
except Exception as exc:
    logger.error("Failed to register live router: %s", exc)

# Auth endpoints
try:
    from api.middleware.auth import create_access_token
    from core.schemas import Token

    @app.post("/api/v1/auth/token", response_model=Token, tags=["auth"])
    async def get_token(user_id: str = Body(..., embed=True)):
        """
        Development endpoint: generate a JWT token for a user_id.
        In production, integrate with your auth provider (OAuth2, Auth0, etc.)
        """
        token = create_access_token(user_id)
        return Token(access_token=token)

    logger.info("Auth token endpoint registered")
except Exception as exc:
    logger.error("Failed to register auth endpoint: %s", exc)


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok", "service": "reputation-monitor-api"}


logger.info("Reputation Monitor API startup complete ✓")
