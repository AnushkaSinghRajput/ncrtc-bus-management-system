from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.core.deps import depot_filter_ids, get_current_user, require_roles
from app.database import get_db
from app.models.entities import Route, RouteStop, Stop, User, UserRole
from app.schemas.common import RouteCreate, RouteOut, RouteUpdate, StopOut

router = APIRouter(prefix="/api", tags=["scheduling"])


@router.get("/stops", response_model=list[StopOut])
def list_stops(
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Stop]:
    query = db.query(Stop)
    if q:
        query = query.filter(Stop.name.ilike(f"%{q}%"))
    return query.order_by(Stop.name).limit(200).all()


@router.get("/routes", response_model=list[RouteOut])
def list_routes(
    depot_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Route]:
    q = db.query(Route).options(joinedload(Route.stops).joinedload(RouteStop.stop))
    scoped = depot_filter_ids(user)
    if scoped is not None:
        q = q.filter(Route.depot_id == scoped)
    elif depot_id is not None:
        q = q.filter(Route.depot_id == depot_id)
    return q.order_by(Route.code).all()


@router.get("/routes/{route_id}", response_model=RouteOut)
def get_route(
    route_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Route:
    route = (
        db.query(Route)
        .options(joinedload(Route.stops).joinedload(RouteStop.stop))
        .filter(Route.id == route_id)
        .first()
    )
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    scoped = depot_filter_ids(user)
    if scoped is not None and route.depot_id != scoped:
        raise HTTPException(status_code=403, detail="Depot isolation")
    return route


@router.post("/routes", response_model=RouteOut, status_code=201)
def create_route(
    body: RouteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.depot_manager)),
) -> Route:
    scoped = depot_filter_ids(user)
    if scoped is not None and body.depot_id != scoped:
        raise HTTPException(status_code=403, detail="Cannot create route for another depot")
    if db.query(Route).filter(Route.code == body.code).first():
        raise HTTPException(status_code=400, detail="Route code exists")
    stop_ids = [s.stop_id for s in body.stops]
    found = db.query(Stop).filter(Stop.id.in_(stop_ids)).count()
    if found != len(set(stop_ids)):
        raise HTTPException(status_code=400, detail="Invalid stop in route")
    route = Route(code=body.code.upper(), name=body.name, depot_id=body.depot_id)
    db.add(route)
    db.flush()
    for s in sorted(body.stops, key=lambda x: x.sequence):
        db.add(
            RouteStop(
                route_id=route.id,
                stop_id=s.stop_id,
                sequence=s.sequence,
                planned_offset_min=s.planned_offset_min,
            )
        )
    db.commit()
    return get_route(route.id, db, user)


@router.put("/routes/{route_id}", response_model=RouteOut)
def update_route(
    route_id: int,
    body: RouteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.depot_manager)),
) -> Route:
    route = db.query(Route).filter(Route.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    scoped = depot_filter_ids(user)
    if scoped is not None and route.depot_id != scoped:
        raise HTTPException(status_code=403, detail="Depot isolation")
    if body.name:
        route.name = body.name
    if body.depot_id is not None:
        if scoped is not None and body.depot_id != scoped:
            raise HTTPException(status_code=403, detail="Cannot move route")
        route.depot_id = body.depot_id
    if body.stops is not None:
        if len(body.stops) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 stops")
        db.query(RouteStop).filter(RouteStop.route_id == route.id).delete()
        for s in sorted(body.stops, key=lambda x: x.sequence):
            db.add(
                RouteStop(
                    route_id=route.id,
                    stop_id=s.stop_id,
                    sequence=s.sequence,
                    planned_offset_min=s.planned_offset_min,
                )
            )
    db.commit()
    return get_route(route.id, db, user)


@router.delete("/routes/{route_id}", status_code=204)
def delete_route(
    route_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
) -> None:
    route = db.query(Route).filter(Route.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    db.delete(route)
    db.commit()
