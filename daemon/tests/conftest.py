"""Keep every test away from the live %LOCALAPPDATA%\\Clawdmeter relay files.

The relay files (heartbeat, approve.json, decisions/, notify.json, page.json,
events/, the daemon.pages record, wifi.json) are touched by connect_and_run, so tests that
drive the loop would otherwise write into the running tray daemon's directory (and a
wifi.json waiting there would be sent to a fake board and removed). Point all of it at
tmp_path, and the state file the loop reads every tick with it.

The creature hooks (clawdmeter_hooks.py) keep state.json, hooks.json and
hooks.lock in their own BASE_DIR (they do not import clawdmeter_state, to stay
quick), so BASE_DIR goes to the same tmp folder as clawdmeter_state.STATE_FILE:
what a hook writes, state.load() reads back.

Board discovery never runs the real PnP lookup: it would find the boards bonded
to this PC and hand them to a real connect_and_run, fighting the live tray over
Bluetooth. Tests that need bonds fake _bonded_pnp_ids themselves. No test
inherits a CLAWDMETER_BLE_ADDRESS pin from the shell it was started in, each
starts with no board linked, and log lines stay out of the live daemon.log.
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
    monkeypatch.setattr(mod, "STATE_FILE", base / "state.json")
    monkeypatch.setattr(mod, "NOTIFY_FILE", base / "notify.json")
    monkeypatch.setattr(mod, "PAGE_FILE", base / "page.json")
    monkeypatch.setattr(mod, "EVENT_DIR", base / "events")
    monkeypatch.setattr(mod, "PAGE_BOARDS_FILE", base / "daemon.pages")
    monkeypatch.setattr(mod, "_PAGED", None)            # read again from this test's record
    monkeypatch.setattr(mod, "WIFI_FILE", base / "wifi.json")
    monkeypatch.setattr(mod, "_WIFI_BUSY", False)
    monkeypatch.setattr(mod, "_WIFI_SENT", None)
    monkeypatch.setattr(mod, "_WIFI_UNREAD", None)
    monkeypatch.setattr(mod, "_BONDED", [])
    monkeypatch.setattr(mod, "_bonded_pnp_ids", lambda: [])
    monkeypatch.setattr(mod, "_LIVE_LINKS", set())
    monkeypatch.setattr(mod, "_FILE_LOGGER", None)
    monkeypatch.delenv("CLAWDMETER_BLE_ADDRESS", raising=False)
    monkeypatch.setattr(hook, "APPROVE_FILE", base / "approve.json")
    monkeypatch.setattr(hook, "DECISION_DIR", base / "decisions")
    monkeypatch.setattr(hook, "HEARTBEAT_FILE", base / "daemon.heartbeat")
    monkeypatch.setattr(state, "STATE_FILE", base / "state.json")
    monkeypatch.setattr(creature, "BASE_DIR", str(base))
    return base
