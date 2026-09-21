"""Tiny in-memory TTL cache for rarely-changing public GET endpoints.

Single-process scope (uvicorn workers each hold their own copy). Entries
expire quickly so admin changes propagate within seconds — no invalidation
plumbing needed."""

import threading
import time
from typing import Any, Callable

_store: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def get_or_set(key: str, ttl_seconds: float, producer: Callable[[], Any]) -> Any:
    now = time.monotonic()
    with _lock:
        hit = _store.get(key)
        if hit and hit[0] > now:
            return hit[1]
    value = producer()
    with _lock:
        _store[key] = (now + ttl_seconds, value)
    return value


def bust(prefix: str) -> None:
    """Drop cached entries — call after admin mutations so public
    endpoints (payment methods, config, legal) update immediately."""
    with _lock:
        for k in [k for k in _store if k.startswith(prefix)]:
            del _store[k]
