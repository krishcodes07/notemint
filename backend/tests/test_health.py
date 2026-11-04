"""Health endpoint tests."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_returns_200() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {"status": "healthy", "service": "notemint-api"}


def test_unknown_api_route_returns_404() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert "detail" in response.json()


def test_health_info_returns_environment() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/health/info")

    assert response.status_code == 200
    body = response.json()
    assert body["environment"]
    assert body["api_prefix"] == "/api/v1"
