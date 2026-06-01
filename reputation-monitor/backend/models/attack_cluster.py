from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.connection import Base


class AttackCluster(Base):
    __tablename__ = "attack_clusters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    keyword_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("keywords.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    cluster_size: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    # List of platform post IDs (or author IDs) that form the cluster
    member_ids: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=lambda: [])
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # One of: 'active', 'resolved', 'dismissed'
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False, index=True)

    # Relationships
    keyword: Mapped["Keyword"] = relationship(  # noqa: F821
        "Keyword", back_populates="attack_clusters"
    )
