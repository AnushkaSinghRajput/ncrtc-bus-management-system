"""Meaningful API tests against a running stack or sqlite-less skip.

These tests expect DATABASE_URL pointing at a seeded Postgres (docker compose).
"""

from __future__ import annotations

import os

import httpx
import pytest

BASE = os.getenv("API_BASE", "http://localhost:8000")


def _login(username: str, password: str = "password") -> str:
    r = httpx.post(
        f"{BASE}/api/auth/login",
        data={"username": username, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def api_up():
    try:
        r = httpx.get(f"{BASE}/health", timeout=5)
        if r.status_code != 200:
            pytest.skip("API not up")
    except Exception:
        pytest.skip("API not up")


def test_health(api_up):
    r = httpx.get(f"{BASE}/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["gps"] == "simulated"


def test_admin_login_and_me(api_up):
    token = _login("admin")
    r = httpx.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_bad_login(api_up):
    r = httpx.post(
        f"{BASE}/api/auth/login",
        data={"username": "admin", "password": "wrong"},
        timeout=10,
    )
    assert r.status_code == 401


def test_depot_isolation_for_manager(api_up):
    token = _login("manager1")
    headers = {"Authorization": f"Bearer {token}"}
    depots = httpx.get(f"{BASE}/api/depots", headers=headers, timeout=10).json()
    assert len(depots) == 1
    vehicles = httpx.get(f"{BASE}/api/vehicles", headers=headers, timeout=10).json()
    assert vehicles
    assert all(v["depot_id"] == depots[0]["id"] for v in vehicles)


def test_driver_today_duty_and_notices(api_up):
    token = _login("driver1")
    headers = {"Authorization": f"Bearer {token}"}
    duty = httpx.get(f"{BASE}/api/duties/today", headers=headers, timeout=10)
    assert duty.status_code == 200
    notices = httpx.get(f"{BASE}/api/notices", headers=headers, timeout=10)
    assert notices.status_code == 200
    assert isinstance(notices.json(), list)


def test_avls_live(api_up):
    token = _login("control1")
    r = httpx.get(
        f"{BASE}/api/avls/live",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_panic_creates_p1(api_up):
    token = _login("driver1")
    headers = {"Authorization": f"Bearer {token}"}
    r = httpx.post(f"{BASE}/api/incidents/panic", headers=headers, timeout=15)
    assert r.status_code == 201
    body = r.json()
    assert body["severity"] == "P1"
    assert body["status"] == "open"


def test_admin_can_create_notice(api_up):
    token = _login("admin")
    headers = {"Authorization": f"Bearer {token}"}
    r = httpx.post(
        f"{BASE}/api/notices",
        headers=headers,
        json={
            "title": "Test notice from pytest",
            "body": "Automated test body",
            "audience": {"type": "all_drivers"},
            "ack_required": False,
        },
        timeout=15,
    )
    assert r.status_code == 201
    assert r.json()["title"].startswith("Test notice")
