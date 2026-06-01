from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.connection import Base


class Post(Base):
    __tablename__ = "posts"
    __table_args__ = (UniqueConstraint("platform", "post_id", name="uq_platform_post_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    keyword_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("keywords.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    platform: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Platform-native post identifier
    post_id: Mapped[str] = mapped_column(String(255), nullable=False)
    author_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    author_name: Mapped[str] = mapped_column(String(255), nullable=False)
    followers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    likes_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    replies_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    shares_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

    # Relationships
    keyword: Mapped["Keyword"] = relationship("Keyword", back_populates="posts")  # noqa: F821
    sentiment_results: Mapped[list["SentimentResult"]] = relationship(  # noqa: F821
        "SentimentResult", back_populates="post", cascade="all, delete-orphan"
    )
