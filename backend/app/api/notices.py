from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import depot_filter_ids, get_current_user, require_roles
from app.database import get_db
from app.models.entities import Notice, NoticeRead, User, UserRole
from app.schemas.common import (
    MessageOut,
    NoticeAudienceMember,
    NoticeAudienceOut,
    NoticeCreate,
    NoticeOut,
    NoticeReadOut,
)

router = APIRouter(prefix="/api/notices", tags=["cms"])


def _targets_user(notice: Notice, user: User) -> bool:
    aud = notice.audience_json or {}
    kind = aud.get("type", "all_drivers")
    if kind == "all":
        return True
    if kind == "all_drivers":
        return user.role in (UserRole.driver, UserRole.conductor)
    if kind == "role":
        return user.role.value == aud.get("role")
    if kind == "depot":
        return user.depot_id == aud.get("depot_id")
    return False


@router.get("", response_model=list[NoticeOut])
def list_notices(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[NoticeOut]:
    now = datetime.now(timezone.utc)
    notices = (
        db.query(Notice)
        .filter(Notice.publish_at <= now)
        .order_by(Notice.publish_at.desc())
        .all()
    )
    reads = {
        r.notice_id: r
        for r in db.query(NoticeRead).filter(NoticeRead.user_id == user.id).all()
    }
    out: list[NoticeOut] = []
    for n in notices:
        if user.role not in (UserRole.admin, UserRole.control_room_operator, UserRole.depot_manager):
            if not _targets_user(n, user):
                continue
        r = reads.get(n.id)
        item = NoticeOut.model_validate(n)
        item.read = r is not None
        item.acknowledged = bool(r and r.acknowledged)
        out.append(item)
    return out


@router.post("", response_model=NoticeOut, status_code=201)
def create_notice(
    body: NoticeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
) -> NoticeOut:
    notice = Notice(
        title=body.title.strip(),
        body=body.body.strip(),
        audience_json=body.audience,
        publish_at=body.publish_at or datetime.now(timezone.utc),
        created_by=user.id,
        ack_required=body.ack_required,
    )
    db.add(notice)
    db.commit()
    db.refresh(notice)
    item = NoticeOut.model_validate(notice)
    item.read = False
    return item


@router.post("/{notice_id}/read", response_model=MessageOut)
def mark_read(
    notice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")
    existing = (
        db.query(NoticeRead)
        .filter(NoticeRead.notice_id == notice_id, NoticeRead.user_id == user.id)
        .first()
    )
    if not existing:
        db.add(NoticeRead(notice_id=notice_id, user_id=user.id))
        db.commit()
    return MessageOut(message="Marked as read")


@router.post("/{notice_id}/acknowledge", response_model=MessageOut)
def acknowledge(
    notice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")
    existing = (
        db.query(NoticeRead)
        .filter(NoticeRead.notice_id == notice_id, NoticeRead.user_id == user.id)
        .first()
    )
    if not existing:
        existing = NoticeRead(notice_id=notice_id, user_id=user.id, acknowledged=True)
        db.add(existing)
    else:
        existing.acknowledged = True
    db.commit()
    return MessageOut(message="Acknowledged")


@router.get("/{notice_id}/audience", response_model=NoticeAudienceOut)
def audience(
    notice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.depot_manager)),
) -> NoticeAudienceOut:
    """Everyone the notice targets, with read/ack state, so managers can chase who hasn't read it."""
    notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")
    q = db.query(User).filter(User.is_active.is_(True))
    scoped = depot_filter_ids(user)
    if scoped is not None:
        q = q.filter(User.depot_id == scoped)
    reads = {r.user_id: r for r in db.query(NoticeRead).filter(NoticeRead.notice_id == notice_id)}
    members = [
        NoticeAudienceMember(
            user_id=u.id,
            username=u.username,
            full_name=u.full_name,
            role=u.role,
            depot_id=u.depot_id,
            read_at=reads[u.id].read_at if u.id in reads else None,
            acknowledged=bool(u.id in reads and reads[u.id].acknowledged),
        )
        for u in q.order_by(User.full_name).all()
        if _targets_user(notice, u)
    ]
    return NoticeAudienceOut(
        notice_id=notice_id,
        total=len(members),
        read=sum(1 for m in members if m.read_at),
        acknowledged=sum(1 for m in members if m.acknowledged),
        members=members,
    )


@router.get("/{notice_id}/receipts", response_model=list[NoticeReadOut])
def receipts(
    notice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin, UserRole.depot_manager)),
) -> list[NoticeReadOut]:
    notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")
    rows = (
        db.query(NoticeRead, User)
        .join(User, User.id == NoticeRead.user_id)
        .filter(NoticeRead.notice_id == notice_id)
        .all()
    )
    return [
        NoticeReadOut(
            user_id=u.id,
            username=u.username,
            full_name=u.full_name,
            read_at=r.read_at,
            acknowledged=r.acknowledged,
        )
        for r, u in rows
    ]
