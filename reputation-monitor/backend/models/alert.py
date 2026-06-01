from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.connection import Base


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    keyword_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("keywords.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # e.g. 'negative_spike', 'coordinated_attack', 'flagged_author', 'reputation_drop'
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Delivery channels used, e.g. ['email', 'telegram']
    sent_via: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=lambda: [])
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    # Relationships
    keyword: Mapped["Keyword"] = relationship("Keyword", back_populates="alerts")  # noqa: F821
