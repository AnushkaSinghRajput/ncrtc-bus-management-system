from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import depot_filter_ids, get_current_user, require_roles
from app.database import get_db
from app.models.entities import User, UserRole
from app.schemas.common import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    role: UserRole | None = Query(None),
    depot_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.depot_manager, UserRole.control_room_operator)),
) -> list[User]:
    q = db.query(User).filter(User.is_active.is_(True))
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
