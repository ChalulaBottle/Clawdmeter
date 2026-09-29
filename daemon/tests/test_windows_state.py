#!/usr/bin/env python3
"""Host state file (agents / anim) -> payload fields, and the clawdmeter_state CLI.

Every test points STATE_FILE at tmp_path; the real
%LOCALAPPDATA%\\Clawdmeter\\state.json is never touched.

Run: python -m pytest daemon/tests/test_windows_state.py -x -q
"""
import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import daemon.claude_usage_daemon_windows as mod
from daemon import clawdmeter_state as cli


@pytest.fixture
def logs(monkeypatch):
    """Capture daemon log lines (and keep them out of the live tray's daemon.log)."""
    lines = []
    monkeypatch.setattr(mod, "log", lines.append)
    return lines


@pytest.fixture
def state_file(tmp_path, monkeypatch, logs):
    path = tmp_path / "Clawdmeter" / "state.json"
    monkeypatch.setattr(mod, "STATE_FILE", path)
    monkeypatch.setattr(cli, "STATE_FILE", path)
    return path


def _write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj), encoding="utf-8")


# ---------------------------------------------------------------------------
# read_state_fields: file -> "n" / "a"
# ---------------------------------------------------------------------------

def test_state_fields_agents_and_anim(state_file):
    _write(state_file, {"agents": 3, "anim": "work coding", "mode": "build"})
    assert mod.read_state_fields() == {"n": 3, "a": "work coding"}


def test_state_fields_empty_anim_left_out(state_file):
    """"a" stays absent when the anim is empty; "n" rides along even at 0."""
    _write(state_file, {"agents": 0, "anim": "", "mode": ""})
    assert mod.read_state_fields() == {"n": 0}


def test_state_fields_absent_file_merges_nothing(state_file):
    assert mod.read_state_fields() == {}
    assert mod.state_stamp() is None


def test_state_fields_powershell_utf16(state_file):
    """PowerShell 5.1 Out-File writes UTF-16 with a BOM — still parses."""
    state_file.parent.mkdir(parents=True)
    state_file.write_bytes('{"agents": 2}'.encode("utf-16"))
    assert mod.read_state_fields() == {"n": 2}


@pytest.mark.parametrize("content", [
    "",                              # truncated by a non-atomic writer
    "{not json",
    "[1, 2]",
    '{"agents": -1}',
    '{"agents": true}',
    '{"agents": "3"}',
    '{"agents": 1.5}',
    '{"anim": 7}',
    '{"anim": "' + "x" * 24 + '"}',  # longer than the firmware's char[24]
])
def test_state_fields_malformed_is_ignored_not_raised(state_file, logs, content):
    """A bad file logs and returns None (keep the last good state); never raises."""
    state_file.parent.mkdir(parents=True)
    state_file.write_text(content, encoding="utf-8")
    assert mod.read_state_fields() is None
    assert any("State file malformed" in line for line in logs)


# ---------------------------------------------------------------------------
# connect_and_run: fields merged into the payload; a state change pushes now
# ---------------------------------------------------------------------------

def test_state_change_pushes_without_waiting_for_the_poll(state_file, monkeypatch):
    """First payload carries the file's agents; rewriting the file triggers a
    second send on the next tick even though POLL_INTERVAL (60s) hasn't passed."""
    _write(state_file, {"agents": 2, "anim": "", "mode": ""})
    monkeypatch.setattr(mod, "TICK", 0.01)
    monkeypatch.setattr(mod, "read_clock_setting", lambda: "off")   # the live config may turn the clock on

    stop_event = asyncio.Event()
    sent = []

    async def fake_write(_uuid, data, response=False):
        sent.append(json.loads(data))
        if len(sent) == 1:
            _write(state_file, {"agents": 5, "anim": "work coding", "mode": ""})
            st = state_file.stat()  # force a distinct mtime even inside one clock tick
            os.utime(state_file, ns=(st.st_atime_ns, st.st_mtime_ns + 10**9))
        else:
            stop_event.set()

    client = AsyncMock()
    client.connect = AsyncMock(return_value=None)
    client.is_connected = True
    client.disconnect = AsyncMock()
    client.start_notify = AsyncMock()
    client.write_gatt_char = fake_write

    poll = AsyncMock(side_effect=lambda _tok: {"s": 10, "ok": True})
    with patch("daemon.claude_usage_daemon_windows.BleakClient", return_value=client), \
         patch("daemon.claude_usage_daemon_windows.read_token", return_value="tok"), \
         patch("daemon.claude_usage_daemon_windows.poll_api", new=poll):
        asyncio.run(asyncio.wait_for(mod.connect_and_run(MagicMock(), stop_event), timeout=5))

    assert sent == [
        {"s": 10, "ok": True, "n": 2},
        {"s": 10, "ok": True, "n": 5, "a": "work coding"},
    ]
    # the second send reused the fresh usage payload: one API call, not one per state change
    assert poll.call_count == 1


# ---------------------------------------------------------------------------
# clawdmeter_state CLI
# ---------------------------------------------------------------------------

def test_cli_set_merges_clear_resets(state_file, capsys):
    assert cli.main(["set", "--agents", "3", "--anim", "work coding"]) == 0
    assert cli.main(["set", "--mode", "review"]) == 0  # agents/anim kept
    assert json.loads(state_file.read_text()) == {"agents": 3, "anim": "work coding", "mode": "review"}
    assert mod.read_state_fields() == {"n": 3, "a": "work coding"}  # daemon reads what the CLI wrote

    assert cli.main(["show"]) == 0
    assert json.loads(capsys.readouterr().out) == {"agents": 3, "anim": "work coding", "mode": "review"}

    assert cli.main(["clear"]) == 0
    assert json.loads(state_file.read_text()) == {"agents": 0, "anim": "", "mode": ""}
    assert list(state_file.parent.iterdir()) == [state_file]  # no temp files left behind


@pytest.mark.parametrize("argv", [
    ["set", "--agents", "-1"],
    ["set", "--agents", "two"],
    ["set", "--anim", "x" * 24],
])
def test_cli_rejects_bad_values(state_file, argv, capsys):
    with pytest.raises(SystemExit):
        cli.main(argv)
    assert not state_file.exists()


def test_cli_show_on_malformed_file_prints_defaults(state_file, capsys):
    state_file.parent.mkdir(parents=True)
    state_file.write_text("{oops", encoding="utf-8")
    assert cli.main(["show"]) == 0
    assert json.loads(capsys.readouterr().out) == {"agents": 0, "anim": "", "mode": ""}
