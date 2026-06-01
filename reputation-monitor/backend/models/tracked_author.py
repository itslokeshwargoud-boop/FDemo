from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from database.connection import Base


class TrackedAuthor(Base):
    __tablename__ = "tracked_authors"
    __table_args__ = (
        UniqueConstraint("platform", "author_id", name="uq_platform_author_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    platform: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    author_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    author_name: Mapped[str] = mapped_column(String(255), nullable=False)
    followers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    account_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    negative_post_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
