import os, sys, paramiko

HOST = "187.124.9.200"
PW = os.environ["NX_DEPLOY_PW"]  # never hardcode server credentials
cmd = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PW, timeout=20)
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
