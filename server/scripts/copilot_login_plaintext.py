"""Run copilot login and accept plaintext storage automatically."""
import subprocess, sys, time, threading

proc = subprocess.Popen(
    ["/usr/local/lib/python3.12/site-packages/copilot/bin/copilot", "login"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
)

# Read output and auto-accept plaintext prompt
def reader():
    while True:
        line = proc.stdout.readline()
        if not line:
            break
        print(line, end="", flush=True)
        if "plaintext" in line.lower() or "save" in line.lower() or "store" in line.lower() or "yes" in line.lower() or "accept" in line.lower():
            # Send "yes" to accept plaintext storage
            print(">>> Auto-accepting plaintext storage", flush=True)
            proc.stdin.write("yes\n")
            proc.stdin.flush()
            break

t = threading.Thread(target=reader, daemon=True)
t.start()
proc.wait(timeout=120)
t.join(timeout=5)
print(f"\nexit code: {proc.returncode}")
