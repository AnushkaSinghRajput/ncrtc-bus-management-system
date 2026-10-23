"""End-to-end module flow tests against a running seeded stack."""

from __future__ import annotations

import os
from datetime import date, timedelta

import httpx
import pytest

BASE = os.getenv("API_BASE", "http://localhost:8000")


@pytest.fixture(scope="module")
def api_up():
    try:
        r = httpx.get(f"{BASE}/health", timeout=5)
        if r.status_code != 200:
            pytest.skip("API not up")
    except Exception:
        pytest.skip("API not up")


def login(username: str) -> dict:
    r = httpx.post(
        f"{BASE}/api/auth/login",
        data={"username": username, "password": "password"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_route_crud_and_depot_isolation(api_up):
    admin = login("admin")["access_token"]
    mgr = login("manager1")["access_token"]
    stops = httpx.get(f"{BASE}/api/stops", headers=auth(admin), timeout=15).json()
    assert len(stops) >= 3
    ids = [s["id"] for s in stops[:3]]
    code = f"T{date.today().strftime('%H%M%S')}"
    created = httpx.post(
        f"{BASE}/api/routes",
        headers=auth(admin),
        json={
            "code": code,
            "name": "Test feeder",
            "depot_id": 1,
            "stops": [
                {"stop_id": ids[0], "sequence": 1, "planned_offset_min": 0},
                {"stop_id": ids[1], "sequence": 2, "planned_offset_min": 5},
                {"stop_id": ids[2], "sequence": 3, "planned_offset_min": 10},
            ],
        },
        timeout=15,
    )
    assert created.status_code == 201, created.text
    route_id = created.json()["id"]

    # manager1 is depot 1 — can see
    routes = httpx.get(f"{BASE}/api/routes", headers=auth(mgr), timeout=15).json()
    assert any(r["id"] == route_id for r in routes)

    # manager2 is another depot — must not see the depot-1 route
    mgr2 = login("manager2")["access_token"]
    routes2 = httpx.get(f"{BASE}/api/routes", headers=auth(mgr2), timeout=15).json()
    assert not any(r["id"] == route_id for r in routes2)
    assert all(r["depot_id"] == routes2[0]["depot_id"] for r in routes2) if routes2 else True

    deleted = httpx.delete(f"{BASE}/api/routes/{route_id}", headers=auth(admin), timeout=15)
    assert deleted.status_code == 204


def test_duty_assign_publish_ack(api_up):
    mgr = login("manager1")
    mgr_t = mgr["access_token"]
    drivers = httpx.get(f"{BASE}/api/users?role=driver", headers=auth(mgr_t), timeout=15).json()
    vehicles = httpx.get(f"{BASE}/api/vehicles", headers=auth(mgr_t), timeout=15).json()
    routes = httpx.get(f"{BASE}/api/routes", headers=auth(mgr_t), timeout=15).json()
    assert drivers and vehicles and routes

    # pick a driver unlikely to have tomorrow conflict — use last driver
    driver = drivers[-1]
    day = (date.today() + timedelta(days=3)).isoformat()
    # clear conflict by choosing far day; if conflict, skip soft
    body = {
        "date": day,
        "vehicle_id": vehicles[0]["id"],
        "driver_id": driver["id"],
        "route_id": routes[0]["id"],
        "start_time": "08:00:00",
        "end_time": "16:00:00",
    }
    created = httpx.post(f"{BASE}/api/duties", headers=auth(mgr_t), json=body, timeout=15)
    if created.status_code == 400 and "already assigned" in created.text:
        pytest.skip("driver already assigned that day in seed")
    assert created.status_code == 201, created.text
    duty_id = created.json()["id"]
    assert created.json()["status"] == "draft"

    pub = httpx.post(f"{BASE}/api/duties/{duty_id}/publish", headers=auth(mgr_t), timeout=15)
    assert pub.status_code == 200
    assert pub.json()["status"] == "published"

    # driver cannot see draft duties of others; this one is published for them
    # login as that driver username
    # seed usernames are driverN — find via admin list
    admin_t = login("admin")["access_token"]
    all_users = httpx.get(f"{BASE}/api/users", headers=auth(admin_t), timeout=15).json()
    username = next(u["username"] for u in all_users if u["id"] == driver["id"])
    # only works for known demo password users
    dtok = login(username)["access_token"]
    # acknowledge only if date is today — otherwise just verify list includes it
    listed = httpx.get(
        f"{BASE}/api/duties?from_date={day}&to_date={day}",
        headers=auth(dtok),
        timeout=15,
    )
    assert listed.status_code == 200
    assert any(d["id"] == duty_id for d in listed.json())


def test_ims_raise_transition_forbidden_for_driver(api_up):
    drv = login("driver1")["access_token"]
    raised = httpx.post(
        f"{BASE}/api/incidents/json",
        headers=auth(drv),
        json={
            "type": "complaint",
            "severity": "P3",
            "description": "Automated IMS test complaint",
        },
        timeout=15,
    )
    assert raised.status_code == 201
    iid = raised.json()["id"]

    # driver cannot transition
    bad = httpx.post(
        f"{BASE}/api/incidents/{iid}/transition",
        headers=auth(drv),
        json={"to_status": "acknowledged", "note": "nope"},
        timeout=15,
    )
    assert bad.status_code == 403

    ctl = login("control1")["access_token"]
    ok = httpx.post(
        f"{BASE}/api/incidents/{iid}/transition",
        headers=auth(ctl),
        json={"to_status": "acknowledged", "note": "Control room ack"},
        timeout=15,
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "acknowledged"
    assert len(ok.json()["events"]) >= 2


def test_cms_targeting_and_receipts(api_up):
    admin = login("admin")["access_token"]
    notice = httpx.post(
        f"{BASE}/api/notices",
        headers=auth(admin),
        json={
            "title": "CMS targeting test",
            "body": "Drivers only should see this in inbox rules",
            "audience": {"type": "all_drivers"},
            "ack_required": True,
        },
        timeout=15,
    )
    assert notice.status_code == 201
    nid = notice.json()["id"]

    drv = login("driver1")["access_token"]
    inbox = httpx.get(f"{BASE}/api/notices", headers=auth(drv), timeout=15).json()
    assert any(n["id"] == nid for n in inbox)

    httpx.post(f"{BASE}/api/notices/{nid}/read", headers=auth(drv), timeout=15)
    httpx.post(f"{BASE}/api/notices/{nid}/acknowledge", headers=auth(drv), timeout=15)

    receipts = httpx.get(f"{BASE}/api/notices/{nid}/receipts", headers=auth(admin), timeout=15)
    assert receipts.status_code == 200
    assert any(r["username"] == "driver1" and r["acknowledged"] for r in receipts.json())


def test_avls_history_and_trail(api_up):
    ctl = login("control1")["access_token"]
    live = httpx.get(f"{BASE}/api/avls/live", headers=auth(ctl), timeout=20).json()
    assert len(live) >= 1
    vid = live[0]["vehicle_id"]
    trail = httpx.get(
        f"{BASE}/api/avls/vehicles/{vid}/trail?minutes=60",
        headers=auth(ctl),
        timeout=15,
    )
    assert trail.status_code == 200
    assert isinstance(trail.json(), list)

    yesterday = (date.today() - timedelta(days=1)).isoformat()
    # scan for a vehicle with history
    vehicles = httpx.get(f"{BASE}/api/vehicles", headers=auth(ctl), timeout=15).json()
    found = False
    for v in vehicles[:20]:
        hist = httpx.get(
            f"{BASE}/api/avls/history?vehicle_id={v['id']}&day={yesterday}",
            headers=auth(ctl),
            timeout=15,
        )
        assert hist.status_code == 200
        if hist.json():
            found = True
            assert len(hist.json()) >= 10
            break
    assert found, "expected seeded GPS history for yesterday"


def test_driver_cannot_list_all_users(api_up):
    drv = login("driver1")["access_token"]
    r = httpx.get(f"{BASE}/api/users", headers=auth(drv), timeout=15)
    assert r.status_code == 403
