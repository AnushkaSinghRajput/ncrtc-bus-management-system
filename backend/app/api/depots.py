from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import depot_filter_ids, get_current_user
from app.database import get_db
from app.models.entities import Depot, User
from app.schemas.common import DepotOut

router = APIRouter(prefix="/api/depots", tags=["depots"])


@router.get("", response_model=list[DepotOut])
def list_depots(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Depot]:
    q = db.query(Depot)
    depot_id = depot_filter_ids(user)
    if depot_id is not None:
        q = q.filter(Depot.id == depot_id)
    return q.order_by(Depot.name).all()
