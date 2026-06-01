from __future__ import annotations

from datetime import datetime
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, TypeAdapter, field_validator

_email_adapter: TypeAdapter[EmailStr] = TypeAdapter(EmailStr)

# ---------------------------------------------------------------------------
# Generic pagination container
# ---------------------------------------------------------------------------

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: str | None = None


# ---------------------------------------------------------------------------
# Keywords
# ---------------------------------------------------------------------------


class KeywordCreate(BaseModel):
    keyword: str

    @field_validator("keyword")
    @classmethod
    def keyword_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("keyword must not be empty")
        return v


class KeywordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    keyword: str
    created_at: datetime
    is_active: bool
    owner_user_id: UUID | None = None


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------


class PostResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    platform: str
    post_id: str
    author_name: str
    followers_count: int
    content: str
    posted_at: datetime
    url: str
    likes_count: int
    replies_count: int
    shares_count: int
    language: str
    sentiment: str | None = None
    confidence: float | None = None


# ---------------------------------------------------------------------------
# Sentiment / Reputation
# ---------------------------------------------------------------------------


class SentimentSummary(BaseModel):
    keyword: str
    positive_count: int
    negative_count: int
    neutral_count: int
    total_count: int
    negative_ratio: float
    score: float
    risk_level: str


class ReputationScoreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    keyword_id: UUID
    score: float
    positive_count: int
    negative_count: int
    neutral_count: int
    total_count: int
    negative_ratio: float
    risk_level: str
    computed_at: datetime


# ---------------------------------------------------------------------------
# Tracked Authors
# ---------------------------------------------------------------------------


class TrackedAuthorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    platform: str
    author_id: str
    author_name: str
    followers_count: int
    negative_post_count: int
    risk_score: float
    is_flagged: bool
    last_seen_at: datetime


# ---------------------------------------------------------------------------
# Attack Clusters
# ---------------------------------------------------------------------------


class AttackClusterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    keyword_id: UUID
    detected_at: datetime
    cluster_size: int
    confidence_score: float
    member_ids: list[str]
    description: str | None = None
    status: str


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    keyword_id: UUID
    alert_type: str
    message: str
    evidence_url: str | None = None
    sent_via: list[str]
    triggered_at: datetime
    is_read: bool


class AlertSubscribeRequest(BaseModel):
    email: str | None = None
    telegram_chat_id: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        # Delegate to Pydantic's public EmailStr validator
        _email_adapter.validate_python(v)
        return v

    @field_validator("telegram_chat_id")
    @classmethod
    def validate_chat_id(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        return v if v else None


# ---------------------------------------------------------------------------
# Dashboard / Analytics
# ---------------------------------------------------------------------------


class TimelineDataPoint(BaseModel):
    hour: datetime
    positive: int
    negative: int
    neutral: int


class PlatformBreakdown(BaseModel):
    platform: str
    positive: int
    negative: int
    neutral: int
    total: int


class LiveStatsPayload(BaseModel):
    positive_count: int
    negative_count: int
    neutral_count: int
    reputation_score: float
    negative_ratio: float
    risk_level: str
    total_last_hour: int
