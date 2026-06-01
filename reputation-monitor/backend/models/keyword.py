from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.connection import Base


class Keyword(Base):
    __tablename__ = "keywords"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    keyword: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # Relationships
    posts: Mapped[list["Post"]] = relationship(  # noqa: F821
        "Post", back_populates="keyword", cascade="all, delete-orphan"
    )
    reputation_scores: Mapped[list["ReputationScore"]] = relationship(  # noqa: F821
        "ReputationScore", back_populates="keyword", cascade="all, delete-orphan"
    )
    attack_clusters: Mapped[list["AttackCluster"]] = relationship(  # noqa: F821
        "AttackCluster", back_populates="keyword", cascade="all, delete-orphan"
    )
    alerts: Mapped[list["Alert"]] = relationship(  # noqa: F821
        "Alert", back_populates="keyword", cascade="all, delete-orphan"
    )
