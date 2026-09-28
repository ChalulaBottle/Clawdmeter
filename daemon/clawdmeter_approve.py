#!/usr/bin/env python3
"""Claude Code PermissionRequest hook: answer the prompt from the Clawdmeter.

Claude Code runs this when it is about to ask for permission. The script puts
the request in front of the device (through the daemon), waits for the button
press or tap, and answers "allow" when it comes. In every other case it prints
nothing and exits 0, which shows the normal terminal prompt: no daemon, device
not connected, another prompt already on the panel, no answer inside the
window, or any error at all. The device can only say yes; a no is given in the
terminal, where the whole prompt is always visible.

Not installed by this file. The operator adds it to settings.json:

    "hooks": {
      "PermissionRequest": [
        {"matcher": "", "hooks": [
          {"type": "command",
           "command": "python \\"C:\\\\...\\\\daemon\\\\clawdmeter_approve.py\\"",
           "timeout": 60}
        ]}
      ]
    }

The script always finishes inside WAIT_S, well under that timeout, so the hook
timeout path (which discards the output) is never the one that runs.

Files, all under %LOCALAPPDATA%\\Clawdmeter:
    daemon.heartbeat      the daemon, every tick: {"ts", "connected"}
    approve.json          this script's request: {"id", "tool", "text", "expires", "pid"}
    decisions/<id>.json   the daemon, once the device answers: {"behavior": "allow"}

Stdlib only on purpose: this runs on every permission prompt.

    python daemon/clawdmeter_approve.py --test Bash "git push origin main"
        Puts a sample prompt on the device and prints what the hook would
        return. Same code path, no Claude Code needed.
"""

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path

BASE = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "Clawdmeter"
HEARTBEAT_FILE = BASE / "daemon.heartbeat"
APPROVE_FILE = BASE / "approve.json"
DECISION_DIR = BASE / "decisions"

WAIT_S = 40.0              # answer window; the device shows the prompt for this long too
HEARTBEAT_MAX_AGE_S = 8.0  # the daemon writes it every second while connected
POLL_S = 0.1
TEXT_MAX = 96              # what the panel shows; the daemon trims to this as well

ALLOW = {"hookSpecificOutput": {"hookEventName": "PermissionRequest",
                                "decision": {"behavior": "allow"}}}


def summarize(tool_name: str, tool_input) -> str:
    """One line of what the tool is about to do, for the panel."""
    if not isinstance(tool_input, dict):
        tool_input = {}
    for key in ("command", "file_path", "notebook_path", "url", "pattern", "description", "prompt", "skill"):
        val = tool_input.get(key)
        if isinstance(val, str) and val.strip():
            text = " ".join(val.split())
            return text if len(text) <= TEXT_MAX else text[:TEXT_MAX - 1] + "\u2026"
    try:
        text = json.dumps(tool_input, separators=(",", ":"))
    except (TypeError, ValueError):
        text = ""
    return text if len(text) <= TEXT_MAX else text[:TEXT_MAX - 1] + "\u2026"


def daemon_ready(now: float | None = None) -> bool:
    """A daemon wrote a heartbeat recently and had the device connected."""
    now = time.time() if now is None else now
    try:
        hb = json.loads(HEARTBEAT_FILE.read_bytes())
    except (OSError, ValueError):
        return False
    if not isinstance(hb, dict) or not hb.get("connected"):
        return False
    ts = hb.get("ts")
    if not isinstance(ts, (int, float)) or isinstance(ts, bool):
        return False
    return 0 <= now - ts <= HEARTBEAT_MAX_AGE_S


def _pid_alive(pid) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes
        SYNCHRONIZE = 0x00100000
        handle = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE, False, pid)
        if not handle:
            return False
        ctypes.windll.kernel32.CloseHandle(handle)
        return True
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def panel_busy(now: float | None = None) -> bool:
    """Another prompt is on the panel: a live request from a script still running."""
    now = time.time() if now is None else now
    try:
        req = json.loads(APPROVE_FILE.read_bytes())
    except (OSError, ValueError):
        return False
    if not isinstance(req, dict):
        return False
    expires = req.get("expires")
    if not isinstance(expires, (int, float)) or isinstance(expires, bool) or expires <= now:
        return False
    return _pid_alive(req.get("pid"))


def _write_atomic(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(obj), encoding="utf-8")
    os.replace(tmp, path)


def _remove_if_ours(request_id: str) -> None:
    """Take approve.json down only while it still holds our request."""
    try:
        req = json.loads(APPROVE_FILE.read_bytes())
        if isinstance(req, dict) and req.get("id") == request_id:
            APPROVE_FILE.unlink()
    except (OSError, ValueError):
        pass


def ask_device(tool_name: str, text: str, wait_s: float | None = None) -> str | None:
    """Show the prompt on the device and wait. "allow" on a press, None otherwise."""
    if not daemon_ready() or panel_busy():
        return None
    request_id = uuid.uuid4().hex[:12]
    deadline = time.time() + (WAIT_S if wait_s is None else wait_s)
    decision_file = DECISION_DIR / f"{request_id}.json"
    try:
        _write_atomic(APPROVE_FILE, {
            "id": request_id,
            "tool": tool_name[:23],
            "text": text[:TEXT_MAX],
            "expires": deadline,
            "pid": os.getpid(),
        })
        while time.time() < deadline:
            try:
                decision = json.loads(decision_file.read_bytes())
            except (OSError, ValueError):
                decision = None
            if isinstance(decision, dict) and decision.get("id") == request_id:
                return "allow" if decision.get("behavior") == "allow" else None
            if not daemon_ready():
                return None     # the relay went away; the terminal takes over now, not in 40s
            time.sleep(POLL_S)
        return None
    finally:
        _remove_if_ours(request_id)
        try:
            decision_file.unlink()
        except OSError:
            pass


def run_hook(stdin_text: str) -> str | None:
    """The hook body: stdin JSON in, the allow JSON (or None for fall-through) out."""
    try:
        req = json.loads(stdin_text)
    except ValueError:
        return None
    if not isinstance(req, dict):
        return None
    tool_name = req.get("tool_name")
    if not isinstance(tool_name, str) or not tool_name:
        return None
    text = summarize(tool_name, req.get("tool_input"))
    if ask_device(tool_name, text) == "allow":
        return json.dumps(ALLOW)
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="clawdmeter_approve",
        description="Claude Code PermissionRequest hook answered from the Clawdmeter.")
    parser.add_argument("--test", nargs=2, metavar=("TOOL", "TEXT"),
                        help="show a sample prompt on the device and print the hook's answer")
    args = parser.parse_args(argv)

    if args.test:
        tool, text = args.test
        if not daemon_ready():
            print("daemon not connected (no fresh heartbeat): the hook would fall through to the terminal")
            return 1
        print(f"on the device: {tool}: {text[:TEXT_MAX]}  (waiting up to {int(WAIT_S)}s)")
        answer = ask_device(tool, text)
        print(json.dumps(ALLOW) if answer == "allow" else "no answer: the hook would fall through to the terminal")
        return 0

    try:
        out = run_hook(sys.stdin.read())
    except Exception:  # noqa: BLE001 - a broken hook must never block a prompt
        out = None
    if out:
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
