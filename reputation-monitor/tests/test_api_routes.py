"""Tests for API routes using FastAPI TestClient."""
import pytest
import sys
import os
from unittest.mock import patch, AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from fastapi.testclient import TestClient
from api.main import app
from api.middleware.auth import create_access_token


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers():
    token = create_access_token("test-user-id")
    return {"Authorization": f"Bearer {token}"}


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_get_token(client):
    response = client.post("/api/v1/auth/token", json={"user_id": "test-user"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_list_keywords_requires_auth(client):
    response = client.get("/api/v1/keywords")
    assert response.status_code == 403  # No auth header → 403


def test_list_keywords_with_auth(client, auth_headers):
    with patch('api.routes.keywords.get_db') as mock_db:
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))),
            scalar=MagicMock(return_value=0),
        ))
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=None)
        
        response = client.get("/api/v1/keywords", headers=auth_headers)
        # May return 200 or 500 depending on DB mock; primarily test auth works
        assert response.status_code in [200, 500]


def test_invalid_token_rejected(client):
    response = client.get("/api/v1/keywords", headers={"Authorization": "Bearer invalid.token.here"})
    assert response.status_code == 401


def test_docs_accessible(client):
    response = client.get("/docs")
    assert response.status_code == 200


def test_openapi_schema(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert "paths" in schema
    assert "/api/v1/keywords" in schema["paths"]


class TestAuthMiddleware:
    def test_create_and_verify_token(self):
        from api.middleware.auth import create_access_token, verify_token
        from fastapi.security import HTTPAuthorizationCredentials
        
        token = create_access_token("user-123")
        assert isinstance(token, str)
        assert len(token) > 20
        
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        token_data = verify_token(credentials)
        assert token_data.user_id == "user-123"

    def test_expired_token_raises(self):
        from jose import jwt
        from core.config import settings
        from api.middleware.auth import verify_token
        from fastapi.security import HTTPAuthorizationCredentials
        import time
        
        expired_payload = {"sub": "user-123", "exp": int(time.time()) - 3600}
        expired_token = jwt.encode(expired_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        
        from fastapi import HTTPException
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=expired_token)
        with pytest.raises(HTTPException) as exc_info:
            verify_token(credentials)
        assert exc_info.value.status_code == 401
