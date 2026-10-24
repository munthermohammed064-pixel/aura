"""A withdrawal must be paid within 72 elapsed hours, including weekends."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func

from app.models.finance import Withdrawal
from app.schemas import ser_dt

OPEN_STATUSES = ("pending", "approved")
PAYMENT_WINDOW = timedelta(hours=72)
ALERT_AFTER = timedelta(hours=48)


def timing(w: Withdrawal, now: datetime) -> dict:
    created = w.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    deadline = created + PAYMENT_WINDOW
    urgency = None
    if w.status in OPEN_STATUSES:
        urgency = "overdue" if now >= deadline else "due_soon" if now >= created + ALERT_AFTER else "scheduled"
    return {"due_at": ser_dt(deadline), "alert_at": ser_dt(created + ALERT_AFTER), "urgency": urgency}


def summary(query, now: datetime) -> dict:
    """Aggregate a withdrawal query, with optional joins/user/search filters."""
    opened = Withdrawal.status.in_(OPEN_STATUSES)
    paid = Withdrawal.status == "paid"
    overdue = opened & (Withdrawal.created_at <= now - PAYMENT_WINDOW)
    soon = opened & (Withdrawal.created_at <= now - ALERT_AFTER) & (Withdrawal.created_at > now - PAYMENT_WINDOW)
    urgent = opened & (Withdrawal.created_at <= now - ALERT_AFTER)
    net = Withdrawal.amount - func.coalesce(Withdrawal.fee, 0) - func.coalesce(Withdrawal.star_penalty, 0)

    def count_if(condition):
        return func.coalesce(func.sum(case((condition, 1), else_=0)), 0)

    def sum_if(condition):
        return func.coalesce(func.sum(case((condition, net), else_=0)), 0)

    row = query.with_entities(
        func.count(Withdrawal.id), count_if(opened), sum_if(opened),
        count_if(paid), sum_if(paid), count_if(soon), count_if(overdue), sum_if(urgent),
    ).one()
    return dict(zip(
        ("total", "open_count", "open_net", "paid_count", "paid_net", "due_soon_count", "overdue_count", "urgent_net"),
        (int(row[0]), int(row[1]), float(row[2]), int(row[3]), float(row[4]), int(row[5]), int(row[6]), float(row[7])),
    ))
