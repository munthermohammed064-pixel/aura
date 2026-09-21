"""In-app notifications — rows in `notifications` stream instantly to clients
via /notifications/stream (SSE). Admins get notified of actionable events.

Notifications are stored as structured events (`kind` + `params`) so the
frontend renders them fully localized in the user's chosen language."""

from sqlalchemy.orm import Session

from app.models.platform import Notification
from app.models.user import User


def notify_user(db: Session, user_id, event: str, params: dict | None = None) -> Notification:
    n = Notification(user_id=user_id, kind=event, params=params or {})
    db.add(n)
    return n


def notify_admins(db: Session, event: str, params: dict | None = None) -> None:
    """Push a real-time notification to every active admin (SSE-delivered)."""
    admins = db.query(User).filter(User.role.in_(("admin", "owner")), User.is_active.is_(True)).all()
    for a in admins:
        notify_user(db, a.id, event, params)
