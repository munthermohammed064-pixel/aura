"""SMTP mailer — sends when SMTP_HOST is configured, otherwise no-ops.
Used for password reset, email verification, and key account events."""

import smtplib
from email.message import EmailMessage

from app.config import settings


def configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM)


def send(to: str, subject: str, body: str) -> bool:
    if not configured():
        return False
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as s:
            if settings.SMTP_TLS:
                s.starttls()
            if settings.SMTP_USER:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            s.send_message(msg)
        return True
    except Exception:
        return False


def send_reset(to: str, token: str) -> bool:
    link = f"{settings.FRONTEND_URL}/reset?token={token}"
    return send(to, f"{settings.PLATFORM_NAME} — password reset",
                f"A password reset was requested for your account.\n\n{link}\n\n"
                "This link expires in 1 hour. If you did not request it, ignore this email.")


def send_verification(to: str, token: str) -> bool:
    return send(to, f"{settings.PLATFORM_NAME} — verify your email",
                f"Your email verification code:\n\n{token}\n\n"
                "If you did not create an account, ignore this email.")
