import sys, time, paramiko

HOST, PW = "187.124.9.200", "Nx!Deploy2024z"
cmd = sys.argv[1]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

for attempt in range(30):
    try:
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c.connect(HOST, username="root", password=PW, timeout=15)
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
