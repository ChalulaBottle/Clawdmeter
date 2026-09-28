"""Keep every test away from the live %LOCALAPPDATA%\\Clawdmeter relay files.

The approve relay (heartbeat, approve.json, decisions/) is touched by
connect_and_run on every tick, so tests that drive the loop would otherwise
write into the running tray daemon's directory. Point all of it at tmp_path.
"""
import pytest

import daemon.claude_usage_daemon_windows as mod
import daemon.clawdmeter_approve as hook


@pytest.fixture(autouse=True)
def relay_files(tmp_path, monkeypatch):
    base = tmp_path / "Clawdmeter"
    monkeypatch.setattr(mod, "APPROVE_FILE", base / "approve.json")
    monkeypatch.setattr(mod, "DECISION_DIR", base / "decisions")
    monkeypatch.setattr(mod, "HEARTBEAT_FILE", base / "daemon.heartbeat")
    monkeypatch.setattr(hook, "APPROVE_FILE", base / "approve.json")
    monkeypatch.setattr(hook, "DECISION_DIR", base / "decisions")
    monkeypatch.setattr(hook, "HEARTBEAT_FILE", base / "daemon.heartbeat")
    return base
