import os, sys, paramiko

HOST = "187.124.9.200"
KEY = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".keys", "nx_deploy")
AUTH = {}
if os.path.exists(KEY):
    AUTH["key_filename"] = KEY
if os.environ.get("NX_DEPLOY_PW"):
    AUTH["password"] = os.environ["NX_DEPLOY_PW"]
if not AUTH:
    raise SystemExit("no SSH auth: generate deploy/.keys/nx_deploy or set NX_DEPLOY_PW")
cmd = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", **AUTH, timeout=20)
stdin, stdout, stderr = c.exec_command(cmd, timeout=600, get_pty=True)
out = stdout.read().decode("utf-8", "replace")
err = stderr.read().decode("utf-8", "replace")
code = stdout.channel.recv_exit_status()
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out[-6000:])
if code and err.strip():
    print("STDERR:", err[-2000:])
print(f"[exit={code}]", file=sys.stderr)
sys.exit(code)
