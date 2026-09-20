"""Mailer — Brevo REST API when BREVO_API_KEY is set, SMTP fallback, else no-op.
Used for email OTP verification, password reset, and key account events."""

import json
import smtplib
import urllib.request
from email.message import EmailMessage

from app.config import settings


def configured() -> bool:
    return bool(settings.BREVO_API_KEY or (settings.SMTP_HOST and settings.SMTP_FROM))


def _send_brevo(to: str, subject: str, text: str, html: str | None = None) -> bool:
    payload = {
        "sender": {"email": settings.MAIL_FROM,
                   "name": settings.MAIL_FROM_NAME or settings.PLATFORM_NAME},
        "to": [{"email": to}],
        "subject": subject,
        "textContent": text,
    }
    if html:
        payload["htmlContent"] = html
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode(),
        headers={"api-key": settings.BREVO_API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return 200 <= r.status < 300
    except Exception:
        return False


def _send_smtp(to: str, subject: str, text: str) -> bool:
    if not (settings.SMTP_HOST and settings.SMTP_FROM):
        return False
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
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


def send(to: str, subject: str, body: str, html: str | None = None) -> bool:
    if settings.BREVO_API_KEY:
        return _send_brevo(to, subject, body, html)
    return _send_smtp(to, subject, body)


def _page(title: str, inner: str) -> str:
    """Minimal premium dark email shell — champagne accent on near-black."""
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#0b0a08">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a08;padding:40px 16px">
<tr><td align="center"><table role="presentation" width="480" cellpadding="0" cellspacing="0"
 style="background:#141210;border:1px solid #2a261f;border-radius:16px;padding:36px 32px">
<tr><td style="font-family:Georgia,serif;color:#e8e0cf;font-size:20px;letter-spacing:2px;text-transform:uppercase">{settings.PLATFORM_NAME}</td></tr>
<tr><td style="padding-top:6px"><div style="width:40px;height:2px;background:#c8a45c"></div></td></tr>
<tr><td style="font-family:Georgia,serif;color:#f4efe4;font-size:22px;padding-top:24px">{title}</td></tr>
<tr><td style="font-family:Arial,sans-serif;color:#b8b0a0;font-size:14px;line-height:1.7;padding-top:14px">{inner}</td></tr>
</table></td></tr></table></body></html>"""


def send_reset(to: str, token: str) -> bool:
    link = f"{settings.FRONTEND_URL}/reset?token={token}"
    text = (f"A password reset was requested for your account.\n\n{link}\n\n"
            "This link expires in 1 hour. If you did not request it, ignore this email.")
    html = _page("Password reset",
                 f'A password reset was requested for your account.<br><br>'
                 f'<a href="{link}" style="display:inline-block;background:#c8a45c;color:#0b0a08;'
                 f'font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;'
                 f'padding:12px 28px;border-radius:10px">Reset password</a><br><br>'
                 f'This link expires in 1 hour. If you did not request it, ignore this email.')
    return send(to, f"{settings.PLATFORM_NAME} — password reset", text, html)


def send_verification(to: str, code: str) -> bool:
    text = (f"Your email verification code:\n\n{code}\n\n"
            "If you did not create an account, ignore this email.")
    html = _page("Verify your email",
                 f'Enter this code to verify your account:<br><br>'
                 f'<div style="font-family:Georgia,serif;font-size:38px;letter-spacing:12px;'
                 f'color:#c8a45c;padding:8px 0 4px">{code}</div><br>'
                 f'If you did not create an account, ignore this email.')
    return send(to, f"{settings.PLATFORM_NAME} — your verification code", text, html)
