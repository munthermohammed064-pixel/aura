import os, sys, time, paramiko

HOST = "187.124.9.200"
KEY = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".keys", "nx_deploy")
AUTH = {}
if os.path.exists(KEY):
    AUTH["key_filename"] = KEY
if os.environ.get("NX_DEPLOY_PW"):
    AUTH["password"] = os.environ["NX_DEPLOY_PW"]
if not AUTH:
    raise SystemExit("no SSH auth: generate deploy/.keys/nx_deploy or set NX_DEPLOY_PW")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def connect():
    for _ in range(40):
        try:
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect(HOST, username="root", **AUTH, timeout=15)
            return c
        except Exception as e:
            print(f"retry: {e}", file=sys.stderr); time.sleep(8)
    sys.exit("SSH unreachable")

c = connect()
sftp = c.open_sftp()
sftp.put(r"C:\Users\msi\Downloads\Nexora\backend\e2e_check.py", "/opt/nexora/backend/e2e_check.py")
sftp.close()
print("uploaded e2e_check.py", file=sys.stderr)

cmd = (
    "cd /opt/nexora/backend && "
    "cp dev.db /root/dev.db.pre-e2e && "
    "cp -a dev.db-wal /root/dev.db-wal.pre-e2e 2>/dev/null; cp -a dev.db-shm /root/dev.db-shm.pre-e2e 2>/dev/null; "
    "mkdir -p /root/uploads.pre-e2e && cp -a uploads/. /root/uploads.pre-e2e/ && "
    "set -a; . /opt/nexora/.env; set +a; .venv/bin/python e2e_check.py 2>&1; "
    "echo '---RESTORING---'; "
    "systemctl stop nexora-backend && "
    "mv /root/dev.db.pre-e2e dev.db && rm -f dev.db-wal dev.db-shm && "
    "[ -f /root/dev.db-wal.pre-e2e ] && mv /root/dev.db-wal.pre-e2e dev.db-wal; "
    "[ -f /root/dev.db-shm.pre-e2e ] && mv /root/dev.db-shm.pre-e2e dev.db-shm; "
    "chown nexora:nexora dev.db* && "
    "rm -rf uploads && mv /root/uploads.pre-e2e uploads && chown -R nexora:nexora uploads && "
    "systemctl start nexora-backend && sleep 2 && systemctl is-active nexora-backend"
)
stdin, stdout, stderr = c.exec_command(cmd, timeout=900)
print(stdout.read().decode("utf-8", "replace")[-12000:])
c.close()
