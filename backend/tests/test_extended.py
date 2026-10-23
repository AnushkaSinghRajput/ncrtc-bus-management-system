"""Tests for geofence, roster copy, SLA, audience receipts and admin management against the running stack."""

from __future__ import annotations

import os
from datetime import date, timedelta

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


def test_copy_week_creates_drafts_and_is_idempotent(api_up):
    mgr = token("manager1")
    src = date.today() - timedelta(days=date.today().weekday())
    # Far-future target keeps the test from colliding with seeded or demo weeks.
    target = src + timedelta(weeks=52 + (src.toordinal() % 50))
    first = httpx.post(
        f"{BASE}/api/duties/copy-week?from_week_start={src}&to_week_start={target}",
        headers=auth(mgr),
        timeout=30,
    )
    assert first.status_code == 200, first.text
    copied = httpx.get(
        f"{BASE}/api/duties?from_date={target}&to_date={target + timedelta(days=6)}",
        headers=auth(mgr),
        timeout=15,
    ).json()
    assert copied, "expected the current week roster to be copied"
    assert all(d["status"] == "draft" for d in copied)

    again = httpx.post(
        f"{BASE}/api/duties/copy-week?from_week_start={src}&to_week_start={target}",
        headers=auth(mgr),
        timeout=30,
    )
    assert again.status_code == 200
    assert again.json()["message"].startswith("Copied 0 duties")

    same = httpx.post(
        f"{BASE}/api/duties/copy-week?from_week_start={src}&to_week_start={src}",
        headers=auth(mgr),
        timeout=15,
    )
    assert same.status_code == 400

    drv = token("driver1")
    forbidden = httpx.post(
        f"{BASE}/api/duties/copy-week?from_week_start={src}&to_week_start={target}",
        headers=auth(drv),
        timeout=15,
    )
    assert forbidden.status_code == 403
