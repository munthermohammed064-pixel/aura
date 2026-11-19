import uuid
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt_sha256", "bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_refresh_token(token: str) -> str:
    # JWTs exceed bcrypt's 72-byte limit. Hash every byte of this high-entropy
    # signed token so separate tokens cannot share a truncated verifier.
    return "sha256$" + hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_refresh_token(token: str, hashed: str) -> bool:
    if hashed.startswith("sha256$"):
        return secrets.compare_digest(hash_refresh_token(token), hashed)
    # Existing sessions remain valid until their next normal rotation.
    return verify_password(token, hashed)


def create_access_token(user_id: uuid.UUID, role: str, session_id: uuid.UUID | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "role": role, "type": "access", "exp": expire}
    if session_id:
        payload["sid"] = str(session_id)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(user_id: uuid.UUID, session_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "sid": str(session_id), "type": "refresh", "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    if len(token) > 4096:
        raise ValueError("Token too long")
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
                      options={"require": ["exp", "sub", "type"]})
