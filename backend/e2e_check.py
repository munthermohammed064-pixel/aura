"""Full E2E smoke test - exercises every real flow against the running API.

Usage: .venv/Scripts/python.exe e2e_check.py  (backend must be on :8000)
Exits non-zero on first failure; prints PASS/FAIL per check.
"""
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

BASE = "http://localhost:8000/api"
ROOT = BASE.replace("/api", "")
PASS, FAIL = 0, 0


def check(name, ok, extra=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  PASS {name} {extra}")
    else:
        FAIL += 1
        print(f"  *** FAIL {name} {extra}")


def call(method, path, body=None, token=None, form=None, ua=None):
    if form is not None:
        data, ctype = form
        req = urllib.request.Request(BASE + path, data=data, method=method)
        req.add_header("Content-Type", ctype)
    else:
        req = urllib.request.Request(
            BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
        req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", ua or "e2e-check/1.0")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def upload(token, fname="proof.png"):
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"  # PNG header
        "1f15c4890d0a2d") + b"\x00" * 40
    boundary = "E2EBOUND"
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{fname}\"\r\n"
            f"Content-Type: image/png\r\n\r\n").encode() + png + f"\r\n--{boundary}--\r\n".encode()
    return call("POST", "/uploads", token=token,
                form=(body, f"multipart/form-data; boundary={boundary}"))


def make_admin(login_id, password="Admin123!x"):
    sys.path.insert(0, ".")
    from app.core.security import hash_password
    from app.database import SessionLocal
    from app.models.user import User
    db = SessionLocal()
    u = User(email=f"{login_id}@internal.local", login_id=login_id,
             password_hash=hash_password(password), role="admin",
             referral_code="T" + uuid.uuid4().hex[:8].upper())
    db.add(u)
    db.commit()
    db.close()
    s, b = call("POST", "/auth/login", {"identifier": login_id, "password": password})
    return b.get("access_token"), s


print("=" * 70)
print("1) AUTH & USER LIFECYCLE")
print("=" * 70)

uid = uuid.uuid4().hex[:6]
u_email, u_pw = f"e2e_{uid}@t.com", "Pass1234!"
r_email, r_pw = f"ref_{uid}@t.com", "Pass1234!"

s, b = call("POST", "/auth/register", {"email": r_email, "password": r_pw, "full_name": "Referrer"})
check("register referrer", s == 201, f"{s}")
r_tok = b.get("access_token")
s, me = call("GET", "/auth/me", token=r_tok)
ref_serial = me.get("serial")
check("referrer serial", ref_serial and ref_serial.startswith("LA"), ref_serial)

s, b = call("POST", "/auth/register", {"email": u_email, "password": u_pw, "referral_code": ref_serial})
check("register referred (by serial)", s == 201)
tok = b.get("access_token")

s, me = call("GET", "/auth/me", token=tok)
check("me: serial + referred", me.get("serial", "").startswith("LA"), me.get("serial"))

s, b = call("POST", "/auth/register", {"email": u_email, "password": u_pw})
check("duplicate email rejected", s == 409)

s, b = call("POST", "/auth/login", {"identifier": u_email, "password": "wrong"})
check("wrong password 401", s == 401)
s, b = call("POST", "/auth/login", {"identifier": u_email, "password": u_pw})
check("login ok", s == 200 and b.get("access_token"))
tok2, refresh2 = b["access_token"], b["refresh_token"]

s, b = call("POST", "/auth/refresh", {"refresh_token": refresh2})
check("refresh rotates", s == 200 and b.get("refresh_token") != refresh2)
s, b = call("POST", "/auth/refresh", {"refresh_token": refresh2})
check("old refresh revoked", s == 401)

# session-theft guard: same refresh token from a different browser fingerprint -> revoked
s, b = call("POST", "/auth/login", {"identifier": u_email, "password": u_pw}, ua="browser-A")
stolen = b.get("refresh_token")
s, b = call("POST", "/auth/refresh", {"refresh_token": stolen}, ua="browser-B")
check("stolen-UA refresh rejected", s == 401, f"got {s}")
s, b = call("POST", "/auth/refresh", {"refresh_token": stolen}, ua="browser-A")
check("revoked session stays dead", s == 401, f"got {s}")

# email verification — when a mailer is configured the code is emailed (not
# echoed), so we seed a known-code hash straight into the dev DB instead.
def _db_token(email, column, plain, extra=""):
    import os
    import sqlite3
    from app.core.security import hash_password
    db_path = os.path.join(os.path.dirname(__file__), "dev.db")
    if not os.path.exists(db_path):
        return False
    c = sqlite3.connect(db_path)
    n = c.execute(f"UPDATE users SET {column}=? {extra} WHERE email=?",
                  (hash_password(plain), email)).rowcount
    c.commit(); c.close()
    return n == 1


s, b = call("POST", "/auth/send-verification", {}, token=tok)
otp = b.get("dev_token") or "424242"
if not b.get("dev_token"):
    check("verify code seeded (mail configured)", _db_token(u_email, "verify_token_hash", otp))
s, b = call("POST", "/auth/verify-email", {"token": otp}, token=tok)
check("email verify", s == 200)
s, me = call("GET", "/auth/me", token=tok)
check("email_verified flag", me.get("email_verified") is True)

# password change
s, b = call("POST", "/profile/password", {"current": u_pw, "new": "NewPass123!"}, token=tok)
check("password change", s == 200)
s, b = call("POST", "/auth/login", {"identifier": u_email, "password": "NewPass123!"})
check("login new password", s == 200)

# forgot/reset
s, b = call("POST", "/auth/forgot", {"email": u_email})
reset_tok = b.get("dev_token") or "e2e-reset-token"
if not b.get("dev_token"):
    check("reset token seeded (mail configured)",
          _db_token(u_email, "reset_token_hash", reset_tok,
                    ", reset_expires_at='" +
                    (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat() + "'"))
else:
    check("forgot issues token", s == 200)
s, b = call("POST", "/auth/reset", {"token": reset_tok, "new_password": "Reset123!"})
check("reset password", s == 200)
s, b = call("POST", "/auth/login", {"identifier": u_email, "password": "Reset123!"})
check("login after reset", s == 200)
tok = b["access_token"]

# sessions
s, sess = call("GET", "/profile/sessions", token=tok)
check("sessions listed", s == 200 and len(sess) >= 1, f"{len(sess)} sessions")
# revoke one session (not the current one) and verify it's gone
victim = next((x for x in sess if x.get("id")), None)
if victim and len(sess) > 1:
    s, b = call("DELETE", f"/profile/sessions/{victim['id']}", token=tok)
    s, sess2 = call("GET", "/profile/sessions", token=tok)
    check("session revoked", all(x["id"] != victim["id"] for x in sess2), f"{len(sess2)} left")

# profile update
s, b = call("PUT", "/profile", {"full_name": "E2E User"}, token=tok)
check("profile update", s == 200)

print()
print("=" * 70)
print("2) ADMIN SETUP")
print("=" * 70)
admin_id = f"nxadmin_{uid}"
atok, astat = make_admin(admin_id)
check("admin login via login_id", astat == 200 and bool(atok), f"got {astat}")
# admin email login must fail — admins authenticate by ID only
s, b = call("POST", "/auth/login", {"identifier": f"{admin_id}@internal.local", "password": "Admin123!x"})
check("admin email login rejected", s == 401, f"got {s}")

s, stats = call("GET", "/admin/stats", token=atok)
check("admin stats", s == 200 and "users" in stats, str(stats)[:80])

# user cannot access admin
s, b = call("GET", "/admin/stats", token=tok)
check("non-admin 403", s == 403)

# create a payment method
s, b = call("GET", "/payment-methods")
if not b:
    s, m = call("POST", "/admin/payment-methods",
                {"name": "USDT (TRC20)", "details": "TAddr123", "min_amount": 10, "max_amount": 100000, "is_active": True},
                token=atok)
    check("create payment method", s == 201, str(m)[:60])
s, methods = call("GET", "/payment-methods")
check("payment method listed", len(methods) >= 1, [m["name"] for m in methods])
METHOD = methods[0]["name"]

print()
print("=" * 70)
print("3) UPLOADS")
print("=" * 70)
s, up = upload(tok)
check("upload screenshot", s == 201 and up.get("path", "").startswith("/uploads/"), up.get("path"))
s, up_bad = call("POST", "/uploads", token=tok,
                 form=(b"--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x.txt\"\r\nContent-Type: text/plain\r\n\r\nhi\r\n--b--\r\n",
                       "multipart/form-data; boundary=b"))
check("non-image rejected", s == 400)
# uploaded file is publicly served
import urllib.request as _u
try:
    with _u.urlopen(ROOT + up["path"], timeout=10) as r:
        check("uploaded file served", r.status == 200)
except Exception as e:
    check("uploaded file served", False, str(e))

print()
print("=" * 70)
print("4) DEPOSIT FLOW")
print("=" * 70)
s, w0 = call("GET", "/wallet", token=tok)
check("wallet starts empty", s == 200 and float(w0["available"]) == 0)

s, b = call("POST", "/deposits", {"amount": 100, "method": METHOD, "proof": "", "screenshot": ""}, token=tok)
check("deposit without screenshot rejected", s in (400, 422))
s, b = call("POST", "/deposits", {"amount": 5, "method": METHOD, "screenshot": up["path"]}, token=tok)
check("deposit below min rejected", s == 400)
s, b = call("POST", "/deposits", {"amount": 100, "method": "FAKE", "screenshot": up["path"]}, token=tok)
check("invalid method rejected", s == 400)
s, dep = call("POST", "/deposits", {"amount": 100, "method": METHOD, "proof": "TX1", "screenshot": up["path"]}, token=tok)
check("deposit created", s == 201 and dep.get("status") == "pending")
dep_id = dep["id"]

# admin sees it with joined user fields
s, deps = call("GET", "/admin/deposits?status=pending", token=atok)
row = [d for d in deps if d["id"] == dep_id][0]
check("admin sees deposit + user fields", row["user_email"] == u_email and row["method"] == METHOD,
      f"{row['user_email']} {row['method']}")

# double-approve guard
s, b = call("POST", f"/admin/deposits/{dep_id}/approve", {}, token=atok)
check("approve deposit", s == 200)
s, b = call("POST", f"/admin/deposits/{dep_id}/approve", {}, token=atok)
check("double approve rejected", s == 400)
s, w = call("GET", "/wallet", token=tok)
check("wallet credited $100", s == 200 and float(w["available"]) == 100, w)

# reject path - new deposit
s, dep2 = call("POST", "/deposits", {"amount": 50, "method": METHOD, "screenshot": up["path"]}, token=tok)
s, b = call("POST", f"/admin/deposits/{dep2['id']}/reject", {}, token=atok)
check("reject deposit", s == 200)
s, w = call("GET", "/wallet", token=tok)
check("rejected dep not credited", float(w["available"]) == 100)

print()
print("=" * 70)
print("5) WITHDRAWAL FLOW")
print("=" * 70)
s, b = call("POST", "/withdrawals", {"amount": 20, "address": "whatever"}, token=tok)
check("withdrawal without address rejected", s == 400)

# set withdraw address + QR
s, qr = upload(tok, "qr.png")
s, b = call("POST", "/profile/withdraw-address", {"address": "TUserAddr999", "qr_image": qr["path"]}, token=tok)
check("lock withdraw address", s == 200)
s, b = call("POST", "/profile/withdraw-address", {"address": "TNewAddr123456"}, token=tok)
check("address locked (cannot re-set)", s == 400, f"got {s}")

s, b = call("POST", "/withdrawals", {"amount": 20, "address": "WRONGADDR"}, token=tok)
check("wrong address rejected", s == 400)
s, b = call("POST", "/withdrawals", {"amount": 3, "address": "TUserAddr999"}, token=tok)
check("below min rejected", s == 400)

# withdrawal with global fee (20%): 20 + 4 = 24 held
s, wd = call("POST", "/withdrawals", {"amount": 20, "address": "TUserAddr999"}, token=tok)
check("withdrawal created", s == 201 and wd.get("status") == "pending")
check("fee = 20% of 20", float(wd["fee"]) == 4.0, wd["fee"])
s, w = call("GET", "/wallet", token=tok)
check("hold: avail 76 / pend 24", float(w["available"]) == 76 and float(w["pending"]) == 24, w)

wid = wd["id"]
s, wds = call("GET", "/admin/withdrawals", token=atok)
row = [x for x in wds if x["id"] == wid][0]
check("admin sees wd + address + user", row["address"] == "TUserAddr999" and row["user_serial"])

s, b = call("POST", f"/admin/withdrawals/{wid}/process", {"action": "approve"}, token=atok)
check("approve withdrawal", s == 200)
s, w = call("GET", "/wallet", token=tok)
check("funds still held after approve", float(w["pending"]) == 24)

s, b = call("POST", f"/admin/withdrawals/{wid}/process", {"action": "paid", "txid": "TX777"}, token=atok)
check("mark paid", s == 200)
s, w = call("GET", "/wallet", token=tok)
check("paid: pend released (avail 76 / pend 0)", float(w["available"]) == 76 and float(w["pending"]) == 0, w)

# reject path releases funds
s, wd2 = call("POST", "/withdrawals", {"amount": 10, "address": "TUserAddr999"}, token=tok)
s, w = call("GET", "/wallet", token=tok)
pend_after = float(w["pending"])
s, b = call("POST", f"/admin/withdrawals/{wd2['id']}/process", {"action": "reject", "note": "n"}, token=atok)
check("reject withdrawal", s == 200)
s, w = call("GET", "/wallet", token=tok)
check("reject refunds hold", float(w["pending"]) == 0 and float(w["available"]) == 76, w)

print()
print("=" * 70)
print("6) ADMIN USER CONTROLS")
print("=" * 70)
s, users = call("GET", "/admin/users", token=atok)
me_row = [x for x in users if x["email"] == u_email][0]
my_id = me_row["id"]
check("users list w/ wallet + serial", me_row.get("serial", "").startswith("LA") and me_row.get("wallet"))

# per-user fee override -> 5%
s, b = call("POST", f"/admin/users/{my_id}/fee", {"fee_pct": 5}, token=atok)
check("set user fee 5%", s == 200)
# /withdrawals is limited to 5/min - earlier negative tests already used 5 calls
print("  (waiting 62s for /withdrawals rate-limit window)")
time.sleep(62)
s, wd3 = call("POST", "/withdrawals", {"amount": 10, "address": "TUserAddr999"}, token=tok)
check("custom fee withdrawal created", s == 201, f"got {s} {str(wd3)[:80]}")
if s == 201:
    check("custom fee applied (10->0.5)", float(wd3["fee"]) == 0.5, wd3["fee"])
    s, b = call("POST", f"/admin/withdrawals/{wd3['id']}/process", {"action": "reject"}, token=atok)
    check("reject custom-fee wd", s == 200)
s, b = call("POST", f"/admin/users/{my_id}/fee", {"fee_pct": None}, token=atok)
check("reset fee to global", s == 200)

# balance adjust
s, b = call("POST", f"/admin/users/{my_id}/adjust", {"amount": 25, "bucket": "available", "note": "test"}, token=atok)
check("admin adjust +25", s == 200)
s, w = call("GET", "/wallet", token=tok)
check("wallet reflects +25 -> 101", float(w["available"]) == 101, w["available"])

# freeze -> user blocked everywhere immediately
s, b = call("POST", f"/admin/users/{my_id}/freeze", token=atok)
check("freeze user", s == 200)
s, b = call("POST", "/withdrawals", {"amount": 10, "address": "TUserAddr999"}, token=tok)
check("frozen user withdrawal blocked", s == 403, f"got {s}")
s, b = call("GET", "/wallet", token=tok)
check("frozen user API blocked", s == 403, f"got {s}")
s, b = call("POST", "/auth/login", {"identifier": u_email, "password": "Reset123!"})
check("frozen user login blocked", s == 403, f"got {s}")
s, b = call("POST", f"/admin/users/{my_id}/freeze", token=atok)
check("unfreeze user", s == 200)
s, b = call("GET", "/wallet", token=tok)
check("unfrozen user works again", s == 200, f"got {s}")

# admin address change
s, b = call("POST", f"/admin/users/{my_id}/withdraw-address", {"address": "TAdminSet888"}, token=atok)
check("admin overrides address", s == 200)
s, me = call("GET", "/auth/me", token=tok)
check("address updated", me["default_withdraw_address"] == "TAdminSet888")

# star system: deduct 1 star -> 25% off withdrawal payout
check("user starts 4 stars", me.get("stars", 4) == 4, me.get("stars"))
s, b = call("POST", f"/admin/users/{my_id}/stars", {"stars": 3, "reason": "e2e"}, token=atok)
check("admin deducts a star", s == 200)
s, wd4 = call("POST", "/withdrawals", {"amount": 10, "address": "TAdminSet888"}, token=tok)
check("penalty wd created", s == 201, f"got {s}")
if s == 201:
    check("star penalty = 25% of 10", float(wd4.get("star_penalty", 0)) == 2.5, wd4.get("star_penalty"))
    s, b = call("POST", f"/admin/withdrawals/{wd4['id']}/process", {"action": "reject"}, token=atok)
s, rows = call("GET", "/admin/withdrawals", token=atok)
pen = next((r for r in rows if float(r.get("star_penalty") or 0) > 0), None)
check("admin sees net payout", pen is not None and float(pen["net_payout"]) == 7.5, pen and pen.get("net_payout"))
s, b = call("POST", f"/admin/users/{my_id}/stars", {"stars": 4, "reason": "restore"}, token=atok)
check("admin restores star", s == 200)

print()
print("=" * 70)
print("7) PACKAGES & INVESTMENT")
print("=" * 70)
s, p = call("POST", "/admin/packages", {
    "name": f"E2E Pkg {uid}", "description": "test pkg", "min_deposit": 15, "max_deposit": 1000,
    "yield_min_pct": 3, "yield_max_pct": 7, "duration_days": 30, "is_active": True, "sort_order": 1}, token=atok)
check("create package", s == 201, str(p)[:70])
pkg_id = p["id"]

s, b = call("PUT", f"/admin/packages/{pkg_id}", {
    "name": f"E2E Pkg {uid}", "description": "edited", "min_deposit": 15, "max_deposit": 1000,
    "yield_min_pct": 3, "yield_max_pct": 7, "duration_days": 30, "is_active": True, "sort_order": 1}, token=atok)
check("edit package keeps fields", s == 200 and b.get("description") == "edited")

s, pkgs = call("GET", "/packages")
check("package public", any(x["id"] == pkg_id for x in pkgs))

s, b = call("POST", "/invest", {"package_id": pkg_id, "amount": 15, "acknowledge_risk": False}, token=tok)
check("invest w/o ack rejected", s == 400)
s, b = call("POST", "/invest", {"package_id": pkg_id, "amount": 999999, "acknowledge_risk": True}, token=tok)
check("invest above max rejected", s == 400)

s, inv = call("POST", "/invest", {"package_id": pkg_id, "amount": 15, "acknowledge_risk": True}, token=tok)
check("invest $15", s == 201, str(inv)[:70])
s, w = call("GET", "/wallet", token=tok)
check("invest moved to invested bucket", float(w["invested"]) == 15 and float(w["available"]) == 86, w)

# referral reward -> referrer gets 15% of 15 = 2.25
s, rw = call("GET", "/wallet", token=r_tok)
check("referrer got 15% reward ($2.25)", float(rw["available"]) == 2.25, rw["available"])
s, rdata = call("GET", "/referrals", token=r_tok)
check("referrals page data", any(x["email"] == u_email for x in rdata.get("referred", [])))

# settle investment
s, b = call("POST", f"/admin/investments/{inv['id']}/settle", {"return_amount": 3}, token=atok)
check("settle investment +$3", s == 200)
s, w = call("GET", "/wallet", token=tok)
check("return credited", float(w["available"]) == 89, w["available"])
s, invs = call("GET", "/investments", token=tok)
check("investment completed + realized 3", invs[0]["status"] == "completed" and float(invs[0]["realized_return"]) == 3, invs[0])

print()
print("=" * 70)
print("8) SUPPORT TICKETS")
print("=" * 70)
s, tk = call("POST", "/tickets", {"subject": "E2E help", "body": "body1"}, token=tok)
check("create ticket", s == 201)
tid = tk["id"]
s, b = call("POST", f"/tickets/{tid}/reply", {"body": "user reply"}, token=tok)
check("user reply", s == 200)
s, b = call("POST", f"/tickets/{tid}/reply", {"body": "admin reply"}, token=atok)
check("admin reply", s == 200)
s, d = call("GET", f"/tickets/{tid}", token=atok)
check("admin sees replies", len(d["replies"]) == 3)
s, b = call("POST", f"/admin/tickets/{tid}/close", {}, token=atok)
check("close ticket", s == 200)

print()
print("=" * 70)
print("9) NOTIFICATIONS")
print("=" * 70)
s, notifs = call("GET", "/notifications", token=tok)
kinds = {n["kind"] for n in notifs}
check("user notifs (deposit/wd/settle)", s == 200 and len(notifs) >= 3, f"{len(notifs)}: {sorted(kinds)}")
s, anotifs = call("GET", "/notifications", token=atok)
check("admin got deposit+wd+ticket notifs", any("deposit" in n["kind"] for n in anotifs)
      and any("withdrawal" in n["kind"] for n in anotifs), f"{len(anotifs)}")
# mark single notification read (was silently broken: str id vs UUID)
nid = notifs[0]["id"]
s, b = call("POST", f"/notifications/{nid}/read", {}, token=tok)
s, notifs2 = call("GET", "/notifications", token=tok)
check("mark-one-read persisted", any(n["id"] == nid and n["read"] for n in notifs2))
s, b = call("POST", "/notifications/read-all", {}, token=tok)
check("read-all", s == 200)
s, notifs3 = call("GET", "/notifications", token=tok)
check("all marked read", all(n["read"] for n in notifs3))

print()
print("=" * 70)
print("10) PUBLIC ENDPOINTS")
print("=" * 70)
for p in ["/config", "/faq", "/legal/terms", "/legal/privacy", "/markets/prices", "/raffles"]:
    s, b = call("GET", p)
    check(f"GET {p}", s == 200, str(b)[:60])

# settings update
s, b = call("PUT", "/admin/settings/deposit", {"value": {"min": 10, "max": 100000}}, token=atok)
check("settings update", s == 200)
s, audit = call("GET", "/admin/audit", token=atok)
check("audit recorded actions", len(audit) >= 5, f"{len(audit)} entries")

# ledger sanity: every entry has user + kind + direction + amount
s, txs = call("GET", "/wallet/transactions", token=tok)
check("ledger entries present", len(txs) >= 5)
kinds = {x["kind"] for x in txs}
check("ledger kinds sane", kinds <= {"deposit", "withdrawal", "investment", "return", "commission", "adjustment", "fee"}, str(kinds))

print()
print("=" * 70)
print(f"RESULT: {PASS} passed, {FAIL} failed")
print("=" * 70)
sys.exit(1 if FAIL else 0)
