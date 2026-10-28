"""Platform working time: Monday–Friday, 24 hours/day, in UTC.

Saturday and Sunday contribute no time. Naive database dates mean UTC.
"""
from datetime import datetime, timedelta, timezone


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def add_working_time(start: datetime, duration: timedelta) -> datetime:
    if duration < timedelta(0):
        raise ValueError("Working duration cannot be negative")
    current = utc(start)
    while current.weekday() >= 5:
        current = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    while duration > timedelta(0):
        boundary = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        step = min(duration, boundary - current)
        current += step
        duration -= step
        if duration:
            while current.weekday() >= 5:
                current += timedelta(days=1)
    return current


def working_cutoff(now: datetime, duration: timedelta) -> datetime:
    """Latest creation time whose working-time deadline has arrived.

    Suitable for indexed SQL comparisons, including at midnight/weekends.
    """
    if duration <= timedelta(0):
        raise ValueError("Cutoff duration must be positive")
    current = utc(now)
    if current.weekday() >= 5:
        current = current.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=current.weekday() - 5)
    while duration > timedelta(0):
        midnight = current.replace(hour=0, minute=0, second=0, microsecond=0)
        if current == midnight:
            previous = current - timedelta(days=1)
            if previous.weekday() >= 5:
                current -= timedelta(days=previous.weekday() - 4)
                continue
            midnight = previous
        step = min(duration, current - midnight)
        current -= step
        duration -= step
    return current
