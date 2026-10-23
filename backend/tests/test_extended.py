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


def test_notice_audience_tracks_unread_members(api_up):
    admin = token("admin")
    created = httpx.post(
        f"{BASE}/api/notices",
        headers=auth(admin),
        json={"title": "Audience check", "body": "Please read", "audience": {"type": "all_drivers"}, "ack_required": True},
        timeout=15,
    )
    assert created.status_code == 201, created.text
    nid = created.json()["id"]

    before = httpx.get(f"{BASE}/api/notices/{nid}/audience", headers=auth(admin), timeout=20).json()
    assert before["total"] > 1
    assert before["read"] == 0
    assert all(m["role"] in ("driver", "conductor") for m in before["members"])

    drv = token("driver1")
    assert httpx.post(f"{BASE}/api/notices/{nid}/acknowledge", headers=auth(drv), timeout=15).status_code == 200
    after = httpx.get(f"{BASE}/api/notices/{nid}/audience", headers=auth(admin), timeout=20).json()
    assert after["read"] == 1 and after["acknowledged"] == 1
    d1 = next(m for m in after["members"] if m["username"] == "driver1")
    assert d1["read_at"] and d1["acknowledged"]

    mgr = token("manager1")
    me = httpx.get(f"{BASE}/api/auth/me", headers=auth(mgr), timeout=10).json()
    scoped = httpx.get(f"{BASE}/api/notices/{nid}/audience", headers=auth(mgr), timeout=20).json()
    assert scoped["total"] < after["total"]
    assert all(m["depot_id"] == me["depot_id"] for m in scoped["members"])

    assert httpx.get(f"{BASE}/api/notices/{nid}/audience", headers=auth(drv), timeout=15).status_code == 403


def test_admin_manages_users_and_vehicles(api_up):
    admin = token("admin")
    suffix = str(abs(hash(os.urandom(4))) % 10**6)
    username = f"qa_driver_{suffix}"

    missing_depot = httpx.post(
        f"{BASE}/api/users",
        headers=auth(admin),
        json={"username": username, "full_name": "QA Driver", "role": "driver", "password": "longenough1"},
        timeout=15,
    )
    assert missing_depot.status_code == 400

    created = httpx.post(
        f"{BASE}/api/users",
        headers=auth(admin),
        json={"username": username, "full_name": "QA Driver", "role": "driver", "depot_id": 1, "password": "longenough1"},
        timeout=15,
    )
    assert created.status_code == 201, created.text
    uid = created.json()["id"]
    login = httpx.post(f"{BASE}/api/auth/login", data={"username": username, "password": "longenough1"}, timeout=30)
    assert login.status_code == 200

    off = httpx.patch(f"{BASE}/api/users/{uid}", headers=auth(admin), json={"is_active": False}, timeout=15)
    assert off.status_code == 200 and off.json()["is_active"] is False
    blocked = httpx.post(f"{BASE}/api/auth/login", data={"username": username, "password": "longenough1"}, timeout=30)
    assert blocked.status_code in (400, 401)

    me = httpx.get(f"{BASE}/api/auth/me", headers=auth(admin), timeout=10).json()
    assert httpx.patch(f"{BASE}/api/users/{me['id']}", headers=auth(admin), json={"is_active": False}, timeout=15).status_code == 400

    mgr = token("manager1")
    assert httpx.post(
        f"{BASE}/api/users",
        headers=auth(mgr),
        json={"username": f"x{suffix}", "full_name": "Nope", "role": "driver", "depot_id": 1, "password": "longenough1"},
        timeout=15,
    ).status_code == 403

    mgr_depot = httpx.get(f"{BASE}/api/auth/me", headers=auth(mgr), timeout=10).json()["depot_id"]
    own = httpx.get(f"{BASE}/api/vehicles", headers=auth(mgr), timeout=15).json()[0]
    prev_status = own["status"]
    upd = httpx.patch(f"{BASE}/api/vehicles/{own['id']}", headers=auth(mgr), json={"status": "maintenance"}, timeout=15)
    assert upd.status_code == 200 and upd.json()["status"] == "maintenance"
    httpx.patch(f"{BASE}/api/vehicles/{own['id']}", headers=auth(mgr), json={"status": prev_status}, timeout=15)
    other_depot = 2 if mgr_depot != 2 else 3
    assert httpx.patch(
        f"{BASE}/api/vehicles/{own['id']}", headers=auth(mgr), json={"depot_id": other_depot}, timeout=15
    ).status_code == 403


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
