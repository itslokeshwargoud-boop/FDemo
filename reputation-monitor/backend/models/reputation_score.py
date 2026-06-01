from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.connection import Base


class ReputationScore(Base):
    __tablename__ = "reputation_scores"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    keyword_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("keywords.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Composite score in the range [-100, +100]
    score: Mapped[float] = mapped_column(Float, nullable=False)
    positive_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    negative_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    neutral_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    negative_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # One of: 'low', 'moderate', 'high', 'critical'
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # Relationships
    keyword: Mapped["Keyword"] = relationship(  # noqa: F821
        "Keyword", back_populates="reputation_scores"
    )
