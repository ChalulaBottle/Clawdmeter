#!/usr/bin/env python3
"""Write the host state the Windows daemon forwards to the Clawdmeter.

    python daemon/clawdmeter_state.py set --agents 3 --anim "work coding"
    python daemon/clawdmeter_state.py set --mode review      # other fields kept
    python daemon/clawdmeter_state.py clear
    python daemon/clawdmeter_state.py show

The state lives in %LOCALAPPDATA%\\Clawdmeter\\state.json as
{"agents": int, "anim": str, "mode": str}. The daemon checks it every tick and,
when it changes, sends "n" (agents) and "a" (anim, only when non-empty) to the
device right away instead of at the next 60s poll. "mode" stays on the host.

Writes are atomic (temp file + replace), so the daemon never reads half a file.
Stdlib only on purpose: hooks call this often, and importing the daemon module
would pull in bleak and httpx on every call.
"""

import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path

# Same file as STATE_FILE in claude_usage_daemon_windows.py.
STATE_FILE = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "Clawdmeter" / "state.json"
DEFAULTS = {"agents": 0, "anim": "", "mode": ""}
ANIM_MAX = 23  # firmware keeps the animation name in char[24]


def load() -> dict:
    """Current state over the defaults. A missing or malformed file, or a field
    the daemon would reject, reads as the default rather than failing the command."""
    state = dict(DEFAULTS)
    try:
        data = json.loads(STATE_FILE.read_bytes())
    except (OSError, ValueError):
        return state
    if not isinstance(data, dict):
        return state
    agents, anim, mode = data.get("agents"), data.get("anim"), data.get("mode")
    if isinstance(agents, int) and not isinstance(agents, bool) and agents >= 0:
        state["agents"] = agents
    if isinstance(anim, str) and len(anim) <= ANIM_MAX:
        state["anim"] = anim
    if isinstance(mode, str):
        state["mode"] = mode
    return state


def save(state: dict) -> None:
    """Write atomically: a temp file in the same directory, then os.replace."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=STATE_FILE.parent, prefix=".state-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(state, f)
        # Windows refuses to replace a file another process has open, and the
        # daemon holds it for a moment while it reads. Retry briefly.
        for attempt in range(20):
            try:
                os.replace(tmp, STATE_FILE)
                return
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(0.05)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _agents(text: str) -> int:
    try:
        n = int(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"not a whole number: {text!r}")
    if n < 0:
        raise argparse.ArgumentTypeError("must be 0 or more")
    return n


def _anim(text: str) -> str:
    if len(text) > ANIM_MAX:
        raise argparse.ArgumentTypeError(f"longer than the device takes ({ANIM_MAX} chars)")
    return text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="clawdmeter_state",
        description="Set, clear or show the host state the Clawdmeter daemon sends to the device.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_set = sub.add_parser("set", help="merge the given fields into the current state")
    p_set.add_argument("--agents", type=_agents, help="agents working (0 hides the count)")
    p_set.add_argument("--anim", type=_anim,
                       help='splash animation name ("" hands the choice back to the device)')
    p_set.add_argument("--mode", help="free-form mode, kept in the file, not sent to the device")
    sub.add_parser("clear", help="no agents, no animation, no mode")
    sub.add_parser("show", help="print the current state as JSON")
    args = parser.parse_args(argv)

    if args.cmd == "show":
        print(json.dumps(load()))
        return 0
    if args.cmd == "clear":
        save(dict(DEFAULTS))
        return 0
    state = load()
    for key in DEFAULTS:
        val = getattr(args, key)
        if val is not None:
            state[key] = val
    save(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
