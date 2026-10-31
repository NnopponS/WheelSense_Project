"""Perform Copilot CLI device flow via SDK and store token in DB."""
import asyncio, time, json
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.services.ai_chat import _patch_copilot_model_billing_tolerance
from sqlalchemy import select

_patch_copilot_model_billing_tolerance()

from copilot import CopilotClient, SubprocessConfig

async def _run():
    # Step 1: Trigger device flow by starting a subprocess client without token
    # The CLI will prompt for device flow automatically when no token is present
    # We capture the device code from stderr/stdout
    print("Starting Copilot CLI device flow...")
    import subprocess
    proc = subprocess.Popen(
        ["/usr/local/lib/python3.12/site-packages/copilot/bin/copilot", "login"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    # Read until we see the device code
    output_lines = []
    while True:
        line = proc.stdout.readline()
        if not line:
            break
        print(line, end="", flush=True)
        output_lines.append(line)
        if "enter code" in line.lower() or "visit" in line.lower():
            # Print the code prominently
            print("\n" + "="*60)
            for l in output_lines:
                if "code" in l.lower() and "-" in l:
                    # Extract code
                    import re
                    m = re.search(r'\b([A-Z0-9]{4}-[A-Z0-9]{4})\b', l)
                    if m:
                        print(f"DEVICE CODE: {m.group(1)}")
            print("="*60 + "\n")
        if "succeeded" in line.lower():
            break
        if "not saved" in line.lower() or "plaintext" in line.lower():
            # Try to accept plaintext
            proc.stdin.write("yes\n")
            proc.stdin.flush()
            break

    # Wait for completion
    try:
        proc.wait(timeout=120)
    except subprocess.TimeoutExpired:
        proc.kill()

    # Check if token was stored
    import os
    config_path = os.path.expanduser("~/.copilot/config.json")
    if os.path.exists(config_path):
        with open(config_path) as f:
            config = json.load(f)
        token = config.get("githubToken") or config.get("token") or config.get("oauth_token")
        if token:
            print(f"\nToken found in config: {token[:10]}...{token[-5:]}")
            # Store in DB
            async with AsyncSessionLocal() as db:
                ws = (await db.execute(select(Workspace).where(Workspace.id==13))).scalar_one()
                from app.services.ai_chat import set_workspace_copilot_token
                await set_workspace_copilot_token(db, ws.id, token)
                await db.commit()
            print("Token stored in DB!")
            return

    # If not in config, try to get it from the CLI session state
    print("\nToken not in config.json, checking session state...")
    session_dir = os.path.expanduser("~/.copilot/session-state")
    if os.path.exists(session_dir):
        for f in os.listdir(session_dir):
            print(f"  {f}")

    print("\nChecking if CLI stored it elsewhere...")
    for root, dirs, files in os.walk(os.path.expanduser("~/.copilot")):
        for fname in files:
            fpath = os.path.join(root, fname)
            print(f"  {fpath}")
            try:
                with open(fpath) as f:
                    content = f.read()
                    if "gho_" in content or "github_pat_" in content:
                        import re
                        m = re.search(r'(gho_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)', content)
                        if m:
                            token = m.group(1)
                            print(f"\nTOKEN FOUND: {token[:10]}...{token[-5:]}")
                            async with AsyncSessionLocal() as db:
                                ws = (await db.execute(select(Workspace).where(Workspace.id==13))).scalar_one()
                                from app.services.ai_chat import set_workspace_copilot_token
                                await set_workspace_copilot_token(db, ws.id, token)
                                await db.commit()
                            print("Token stored in DB!")
                            return
            except:
                pass

    print("\nNo token found. Login may have failed or token was not stored.")

asyncio.run(_run())
