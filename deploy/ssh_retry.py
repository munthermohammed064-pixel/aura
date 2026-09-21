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
cmd = sys.argv[1]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

for attempt in range(30):
    try:
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c.connect(HOST, username="root", **AUTH, timeout=15)
        stdin, stdout, stderr = c.exec_command(cmd, timeout=900, get_pty=True)
        out = stdout.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        print(out[-8000:])
        print(f"[exit={code}]", file=sys.stderr)
        c.close()
        sys.exit(0 if code == 0 else code)
    except Exception as e:
        print(f"attempt {attempt+1}: {e}", file=sys.stderr)
        time.sleep(10)
sys.exit(1)
