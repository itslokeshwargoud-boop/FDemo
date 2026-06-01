"""Database connection with SQLite fallback support."""
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from core.config import settings

logger = logging.getLogger(__name__)

# Build async-compatible URL
_raw = settings.DATABASE_URL

if _raw.startswith("postgresql://"):
    DATABASE_URL = _raw.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _raw.startswith("postgres://"):
    DATABASE_URL = _raw.replace("postgres://", "postgresql+asyncpg://", 1)
elif _raw.startswith("sqlite"):
    # Ensure async SQLite driver
    if "aiosqlite" not in _raw:
        DATABASE_URL = _raw.replace("sqlite://", "sqlite+aiosqlite://", 1)
    else:
        DATABASE_URL = _raw
else:
    DATABASE_URL = _raw

logger.info("Database URL scheme: %s", DATABASE_URL.split("://")[0] if "://" in DATABASE_URL else "raw")

# Build engine – SQLite does not support pool_size / max_overflow / pool_pre_ping
_engine_kwargs: dict = {"echo": False}
if not settings.is_sqlite:
    _engine_kwargs.update(pool_pre_ping=True, pool_size=10, max_overflow=20)

try:
    engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
    logger.info("Database engine created successfully")
except Exception as exc:
    logger.error("Failed to create database engine: %s", exc)
    # Fallback to SQLite so the app can still start
    DATABASE_URL = "sqlite+aiosqlite:///./reputation.db"
    engine = create_async_engine(DATABASE_URL, echo=False)
    logger.warning("Fell back to SQLite: %s", DATABASE_URL)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    """FastAPI dependency that yields a transactional async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
