"""Keep every test away from the live %LOCALAPPDATA%\\Clawdmeter relay files.

The approve relay (heartbeat, approve.json, decisions/) is touched by
connect_and_run on every tick, so tests that drive the loop would otherwise
write into the running tray daemon's directory. Point all of it at tmp_path.

The creature hooks (clawdmeter_hooks.py) keep state.json, hooks.json and
hooks.lock in their own BASE_DIR (they do not import clawdmeter_state, to stay
quick), so BASE_DIR goes to the same tmp folder as clawdmeter_state.STATE_FILE:
what a hook writes, state.load() reads back.
"""
import pytest

import daemon.claude_usage_daemon_windows as mod
import daemon.clawdmeter_approve as hook
import daemon.clawdmeter_hooks as creature
import daemon.clawdmeter_state as state


@pytest.fixture(autouse=True)
def relay_files(tmp_path, monkeypatch):
    base = tmp_path / "Clawdmeter"
    monkeypatch.setattr(mod, "APPROVE_FILE", base / "approve.json")
    monkeypatch.setattr(mod, "DECISION_DIR", base / "decisions")
    monkeypatch.setattr(mod, "HEARTBEAT_FILE", base / "daemon.heartbeat")
    monkeypatch.setattr(hook, "APPROVE_FILE", base / "approve.json")
    monkeypatch.setattr(hook, "DECISION_DIR", base / "decisions")
    monkeypatch.setattr(hook, "HEARTBEAT_FILE", base / "daemon.heartbeat")
    monkeypatch.setattr(state, "STATE_FILE", base / "state.json")
    monkeypatch.setattr(creature, "BASE_DIR", str(base))
    return base
