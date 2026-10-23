from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import depot_filter_ids, get_current_user, require_roles
from app.core.security import hash_password
from app.database import get_db
from app.models.entities import Depot, User, UserRole
from app.schemas.common import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])

DEPOT_SCOPED_ROLES = {UserRole.depot_manager, UserRole.driver, UserRole.conductor}


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    full_name: str = Field(min_length=2, max_length=120)
    role: UserRole
    depot_id: int | None = None
    phone: str | None = Field(None, max_length=20)
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=120)
    role: UserRole | None = None
    depot_id: int | None = None
    phone: str | None = Field(None, max_length=20)
    is_active: bool | None = None


def _check_depot(db: Session, role: UserRole, depot_id: int | None) -> None:
    if role in DEPOT_SCOPED_ROLES and depot_id is None:
        raise HTTPException(status_code=400, detail=f"A depot is required for the {role.value} role")
    if depot_id is not None and not db.query(Depot).filter(Depot.id == depot_id).first():
        raise HTTPException(status_code=400, detail="Depot not found")


@router.get("", response_model=list[UserOut])
def list_users(
    role: UserRole | None = Query(None),
    depot_id: int | None = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.depot_manager, UserRole.control_room_operator)),
) -> list[User]:
    q = db.query(User)
    if not (include_inactive and user.role == UserRole.admin):
        q = q.filter(User.is_active.is_(True))
    scoped = depot_filter_ids(user)
    if scoped is not None:
        q = q.filter(User.depot_id == scoped)
    elif depot_id is not None:
        q = q.filter(User.depot_id == depot_id)
    if role:
        q = q.filter(User.role == role)
    return q.order_by(User.full_name).all()


@router.get("/me", response_model=UserOut)
def my_profile(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> User:
    username = body.username.lower()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    _check_depot(db, body.role, body.depot_id)
    user = User(
        username=username,
        full_name=body.full_name.strip(),
        role=body.role,
        depot_id=body.depot_id,
        phone=body.phone,
        password_hash=hash_password(body.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.admin)),
) -> User:
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    changes = {
        k: v
        for k, v in body.model_dump(exclude_unset=True).items()
        if v is not None or k in ("depot_id", "phone")
    }
    if target.id == admin.id and (changes.get("is_active") is False or changes.get("role", UserRole.admin) != UserRole.admin):
        raise HTTPException(status_code=400, detail="You cannot deactivate or demote your own account")
    role = changes.get("role", target.role)
    depot_id = changes["depot_id"] if "depot_id" in changes else target.depot_id
    _check_depot(db, role, depot_id)
    for key, value in changes.items():
        setattr(target, key, value)
    db.commit()
    db.refresh(target)
    return target
