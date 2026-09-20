"""Referrals, notifications, support tickets, markets, legal/config, wheel & raffles."""

import asyncio
import json
import random
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user
from app.core.security import decode_token
from app.database import SessionLocal, get_db
from app.models.finance import ReferralCommission
from app.models.platform import Notification, Raffle, RaffleEntry, Ticket, TicketReply, WheelSpin
from app.models.user import User
from app.schemas import ReplyIn, TicketIn
from app.services.cache import get_or_set
from app.services.settings import get_setting

router = APIRouter(tags=["misc"])


# ---------- Referrals ----------
@router.get("/referrals")
def referrals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    referred = db.query(User).filter(User.referred_by_id == user.id).all()
    commissions = (
        db.query(ReferralCommission)
        .filter(ReferralCommission.referrer_id == user.id)
        .order_by(ReferralCommission.created_at.desc())
        .all()
    )
    cfg = get_setting(db, "referral")
    serial = f"LA{user.serial_no:04d}" if user.serial_no is not None else user.referral_code
    return {
        "code": serial,
        "link": f"{settings.FRONTEND_URL}/register?ref={serial}",
        "levels": cfg.get("levels", 1),
        "pcts": {f"l{i}": cfg.get(f"l{i}_pct", 0) for i in range(1, int(cfg.get("levels", 1)) + 1)},
        "referred": [{"id": str(u.id), "email": u.email, "joined": u.created_at} for u in referred],
        "commissions": commissions,
        "total_earned": sum(float(c.amount) for c in commissions),
        "note": "Rewards are paid on actual activity, not a promised profit.",
    }


# ---------- Notifications ----------
@router.get("/notifications")
def notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )


@router.post("/notifications/{notif_id}/read")
def read_notification(notif_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        n = db.get(Notification, uuid.UUID(notif_id))
    except ValueError:
        n = None
    if n and n.user_id == user.id:
        n.read = True
        db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def read_all_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.read.is_(False)
                                  ).update({"read": True})
    db.commit()
    return {"ok": True}


@router.get("/notifications/stream")
async def notification_stream(token: str):
    """SSE stream of unread notification count + latest items (token via query — EventSource can't set headers)."""
    try:
        payload = decode_token(token)
        user_id = uuid.UUID(payload["sub"])
    except Exception:
        raise HTTPException(401, "Invalid token")

    async def gen():
        last_sig = None
        while True:
            db = SessionLocal()
            try:
                notifs = (db.query(Notification)
                          .filter(Notification.user_id == user_id)
                          .order_by(Notification.created_at.desc()).limit(10).all())
                unread = sum(1 for n in notifs if not n.read)
                items = [{"id": str(n.id), "title": n.title, "body": n.body, "kind": n.kind,
                          "params": n.params or {}, "read": n.read,
                          "created_at": n.created_at.isoformat() if n.created_at else None}
                         for n in notifs]
                sig = (unread, tuple(i["id"] for i in items))
                if sig != last_sig:
                    yield f"data: {json.dumps({'unread': unread, 'items': items})}\n\n"
                    last_sig = sig
            finally:
                db.close()
            await asyncio.sleep(5)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------- Support ----------
@router.post("/tickets", status_code=201)
def create_ticket(data: TicketIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = Ticket(user_id=user.id, subject=data.subject)
    db.add(t)
    db.flush()
    db.add(TicketReply(ticket_id=t.id, author_id=user.id, body=data.body))
    from app.services.notify import notify_admins
    notify_admins(db, "admin_ticket_new", {"serial": user.serial, "email": user.email, "subject": data.subject})
    db.commit()
    return {"id": str(t.id)}


@router.get("/tickets")
def my_tickets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Ticket).filter(Ticket.user_id == user.id).order_by(Ticket.created_at.desc()).all()


@router.get("/tickets/{ticket_id}")
def ticket_detail(ticket_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        t = db.get(Ticket, uuid.UUID(ticket_id))
    except ValueError:
        t = None
    if not t or (t.user_id != user.id and user.role != "admin"):
        raise HTTPException(404, "Ticket not found")
    replies = db.query(TicketReply).filter(TicketReply.ticket_id == t.id).order_by(TicketReply.created_at).all()
    return {"ticket": t, "replies": replies}


@router.post("/tickets/{ticket_id}/reply")
def reply_ticket(ticket_id: str, data: ReplyIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        t = db.get(Ticket, uuid.UUID(ticket_id))
    except ValueError:
        t = None
    if not t or (t.user_id != user.id and user.role != "admin"):
        raise HTTPException(404, "Ticket not found")
    is_admin = user.role == "admin"
    db.add(TicketReply(ticket_id=t.id, author_id=user.id, body=data.body, is_admin=is_admin))
    t.status = "answered" if is_admin else "open"
    from app.services.notify import notify_admins, notify_user
    if is_admin:
        notify_user(db, t.user_id, "ticket_replied", {"subject": t.subject})
    else:
        notify_admins(db, "admin_ticket_reply", {"serial": user.serial, "email": user.email, "subject": t.subject})
    db.commit()
    return {"ok": True}


# ---------- Markets (CoinGecko proxy) ----------
@router.get("/markets/prices")
async def prices(ids: str = "bitcoin,ethereum,tether,solana", vs: str = "usd"):
    url = f"{settings.COINGECKO_API_URL}/simple/price"
    params = {"ids": ids, "vs_currencies": vs, "include_24hr_change": "true"}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        return r.json()


# ---------- Public config / legal ----------
@router.get("/config")
def public_config(db: Session = Depends(get_db)):
    def produce():
        platform = get_setting(db, "platform")
        return {"platform_name": platform.get("name", settings.PLATFORM_NAME),
                "maintenance_mode": platform.get("maintenance_mode", False),
                "default_lang": platform.get("default_lang", "en")}
    return get_or_set("config:public", 15, produce)


@router.get("/faq")
def faq(db: Session = Depends(get_db)):
    return get_or_set("faq:public", 30, lambda: get_setting(db, "faq").get("items", []))


@router.get("/legal/{page}")
def legal_page(page: str, db: Session = Depends(get_db)):
    if page not in ("terms", "privacy"):
        raise HTTPException(404)
    return get_or_set(f"legal:{page}", 30, lambda: {"page": page, "content": get_setting(db, "legal").get(page, "")})


# ---------- Wheel & Raffles ----------
@router.post("/wheel/spin")
def wheel_spin(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cfg = get_setting(db, "wheel")
    if not cfg.get("enabled"):
        raise HTTPException(400, "Wheel disabled")
    since = datetime.now(timezone.utc) - timedelta(days=1)
    used = db.query(WheelSpin).filter(WheelSpin.user_id == user.id, WheelSpin.created_at >= since).count()
    if used >= int(cfg.get("daily_spins", 1)):
        raise HTTPException(429, "No spins left today")
    prizes = cfg.get("prizes") or ["nothing"]
    prize = random.choice(prizes)
    db.add(WheelSpin(user_id=user.id, prize=prize))
    db.commit()
    return {"prize": prize}


@router.get("/raffles")
def raffles(db: Session = Depends(get_db)):
    return db.query(Raffle).filter(Raffle.is_active.is_(True)).all()


@router.post("/raffles/{raffle_id}/enter")
def enter_raffle(raffle_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        r = db.get(Raffle, uuid.UUID(raffle_id))
    except ValueError:
        r = None
    if not r or not r.is_active or r.drawn:
        raise HTTPException(404, "Raffle not available")
    existing = db.query(RaffleEntry).filter(
        RaffleEntry.raffle_id == r.id, RaffleEntry.user_id == user.id).first()
    if existing:
        raise HTTPException(409, "Already entered")
    db.add(RaffleEntry(raffle_id=r.id, user_id=user.id))
    db.commit()
    return {"ok": True}
