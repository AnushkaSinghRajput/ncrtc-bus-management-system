"""Tests for geofence, roster copy, SLA, audience receipts and admin management against the running stack."""

from __future__ import annotations

import os

import httpx
import pytest

BASE = os.getenv("API_BASE", "http://localhost:8000")


@pytest.fixture(scope="module")
def api_up():
    try:
        if httpx.get(f"{BASE}/health", timeout=5).status_code != 200:
            pytest.skip("API not up")
    except Exception:
        pytest.skip("API not up")


def token(username: str) -> str:
    r = httpx.post(
        f"{BASE}/api/auth/login",
        data={"username": username, "password": "password"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def test_geofence_alerts_shape_and_depot_scope(api_up):
    admin = token("admin")
    r = httpx.get(f"{BASE}/api/avls/geofence-alerts", headers=auth(admin), timeout=20)
    assert r.status_code == 200, r.text
    for a in r.json():
        assert {"vehicle_id", "reg_no", "depot_name", "distance_m"} <= a.keys()
        assert a["distance_m"] >= 0

    mgr = token("manager1")
    me = httpx.get(f"{BASE}/api/auth/me", headers=auth(mgr), timeout=10).json()
    scoped = httpx.get(f"{BASE}/api/avls/geofence-alerts?depot_id=999", headers=auth(mgr), timeout=20)
    assert scoped.status_code == 200
    assert all(a["depot_id"] == me["depot_id"] for a in scoped.json())
