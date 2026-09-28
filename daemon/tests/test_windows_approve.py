#!/usr/bin/env python3
"""Approve relay: hook -> approve.json -> device message -> device answer -> decision -> hook.

Run: python -m pytest daemon/tests/test_windows_approve.py -x -q
"""
import asyncio
import json
import os
import threading
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import daemon.claude_usage_daemon_windows as mod
import daemon.clawdmeter_approve as hook


@pytest.fixture
def logs(monkeypatch):
    lines = []
    monkeypatch.setattr(mod, "log", lines.append)
    return lines


def _write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj), encoding="utf-8")


def _heartbeat(base, connected=True, age=0.0):
    _write(base / "daemon.heartbeat", {"ts": time.time() - age, "connected": connected})


# ---------------------------------------------------------------------------
# read_approve_msg: file -> device message
# ---------------------------------------------------------------------------

def test_pending_request_becomes_q_message(relay_files, logs):
    _write(relay_files / "approve.json",
           {"id": "abc123", "tool": "Bash", "text": "git push origin main", "expires": time.time() + 30})
    msg = mod.read_approve_msg()
    assert msg["q"] == "abc123" and msg["qt"] == "Bash" and msg["qs"] == "git push origin main"
    assert 25 <= msg["qx"] <= 30


def test_long_tool_and_text_are_trimmed_to_the_panel(relay_files, logs):
    _write(relay_files / "approve.json",
           {"id": "abc123", "tool": "x" * 40, "text": "y" * 300, "expires": time.time() + 30})
    msg = mod.read_approve_msg()
    assert len(msg["qt"]) == mod.APPROVE_TOOL_MAX
    assert len(msg["qs"]) == mod.APPROVE_TEXT_MAX


def test_absent_or_expired_file_clears(relay_files, logs):
    assert mod.read_approve_msg() == {"q": ""}
    _write(relay_files / "approve.json", {"id": "abc123", "tool": "Bash", "text": "x", "expires": time.time() - 1})
    assert mod.read_approve_msg() == {"q": ""}


@pytest.mark.parametrize("content", [
    "", "{not json", "[1]", '{"tool": "Bash"}', '{"id": ""}', '{"id": "has space"}',
    '{"id": "' + "a" * 24 + '"}', '{"id": "x\\"y"}',
])
def test_malformed_request_is_ignored_not_raised(relay_files, logs, content):
    (relay_files / "approve.json").parent.mkdir(parents=True, exist_ok=True)
    (relay_files / "approve.json").write_text(content, encoding="utf-8")
    assert mod.read_approve_msg() is None
    assert any("Approve file malformed" in line for line in logs)


# ---------------------------------------------------------------------------
# Session._on_tx: device answer -> decision file
# ---------------------------------------------------------------------------

def test_device_approve_writes_decision(relay_files, logs):
    s = mod.Session(MagicMock())
    s._on_tx(None, bytearray(b'{"approve":"abc123"}'))
    decision = json.loads((relay_files / "decisions" / "abc123.json").read_text())
    assert decision["id"] == "abc123" and decision["behavior"] == "allow"


@pytest.mark.parametrize("data", [
    b'{"ack":true}', b'{"err":true}', b'not json', b'[1,2]', b'{"approve":"../x"}',
    b'{"approve":""}', b'{"approve":7}',
])
def test_other_tx_notifies_write_nothing(relay_files, logs, data):
    s = mod.Session(MagicMock())
    s._on_tx(None, bytearray(data))
    assert not (relay_files / "decisions").exists()


# ---------------------------------------------------------------------------
# connect_and_run: a request goes to the device at once, as its own message
# ---------------------------------------------------------------------------

def test_request_is_sent_immediately_without_an_api_poll(relay_files, monkeypatch, logs):
    monkeypatch.setattr(mod, "STATE_FILE", relay_files / "state.json")
    monkeypatch.setattr(mod, "TICK", 0.01)
    monkeypatch.setattr(mod, "WATCH_TICK", 0.01)
    approve = relay_files / "approve.json"

    stop_event = asyncio.Event()
    sent = []
    polls = []

    async def fake_write(_uuid, data, response=False):
        sent.append(json.loads(data))
        if len(sent) == 1:
            _write(approve, {"id": "abc123", "tool": "Bash", "text": "rm -rf build", "expires": time.time() + 30})
        elif len(sent) == 2:
            approve.unlink()
        else:
            stop_event.set()

    async def fake_poll(_tok):
        polls.append(time.time())
        return {"s": 10, "ok": True}

    client = AsyncMock()
    client.connect = AsyncMock(return_value=None)
    client.is_connected = True
    client.disconnect = AsyncMock()
    client.start_notify = AsyncMock()
    client.write_gatt_char = fake_write

    with patch("daemon.claude_usage_daemon_windows.BleakClient", return_value=client), \
         patch("daemon.claude_usage_daemon_windows.read_token", return_value="tok"), \
         patch("daemon.claude_usage_daemon_windows.poll_api", new=fake_poll):
        asyncio.run(asyncio.wait_for(mod.connect_and_run(MagicMock(), stop_event), timeout=5))

    assert sent[0] == {"s": 10, "ok": True}
    assert sent[1]["q"] == "abc123" and sent[1]["qt"] == "Bash" and sent[1]["qs"] == "rm -rf build"
    assert sent[2] == {"q": ""}
    assert len(polls) == 1                       # the prompt never waited on the API
    subscribed = {call.args[0] for call in client.start_notify.call_args_list}
    assert subscribed == {mod.REQ_CHAR_UUID, mod.TX_CHAR_UUID}
    hb = json.loads((relay_files / "daemon.heartbeat").read_text())
    assert hb["connected"] is False              # the link is down once the loop ends


def test_request_left_over_from_before_the_link_is_not_shown(relay_files, monkeypatch, logs):
    """A stale approve.json (a hook that died) must not pop up on connect."""
    monkeypatch.setattr(mod, "STATE_FILE", relay_files / "state.json")
    monkeypatch.setattr(mod, "TICK", 0.01)
    monkeypatch.setattr(mod, "WATCH_TICK", 0.01)
    _write(relay_files / "approve.json", {"id": "old", "tool": "Bash", "text": "x", "expires": time.time() + 30})

    sent = []

    async def fake_write(_uuid, data, response=False):
        sent.append(json.loads(data))

    client = AsyncMock()
    client.connect = AsyncMock(return_value=None)
    client.is_connected = True
    client.disconnect = AsyncMock()
    client.start_notify = AsyncMock()
    client.write_gatt_char = fake_write

    async def run_for_a_few_ticks():
        stop_event = asyncio.Event()
        task = asyncio.ensure_future(mod.connect_and_run(MagicMock(), stop_event))
        await asyncio.sleep(0.3)   # ~30 ticks of the file watch
        stop_event.set()
        await task

    with patch("daemon.claude_usage_daemon_windows.BleakClient", return_value=client), \
         patch("daemon.claude_usage_daemon_windows.read_token", return_value="tok"), \
         patch("daemon.claude_usage_daemon_windows.poll_api", new=AsyncMock(return_value={"s": 10, "ok": True})):
        asyncio.run(asyncio.wait_for(run_for_a_few_ticks(), timeout=5))

    assert sent and all("q" not in m for m in sent)


# ---------------------------------------------------------------------------
# The hook script
# ---------------------------------------------------------------------------

def test_summarize_picks_the_line_that_matters():
    assert hook.summarize("Bash", {"command": "git  push\n origin main", "description": "Push"}) == "git push origin main"
    assert hook.summarize("Edit", {"file_path": "C:/x/y.py", "old_string": "a"}) == "C:/x/y.py"
    assert hook.summarize("WebFetch", {"url": "https://example.org"}) == "https://example.org"
    long = hook.summarize("Bash", {"command": "x" * 500})
    assert len(long) == hook.TEXT_MAX and long.endswith("\u2026")
    assert hook.summarize("Odd", {"k": 1}) == '{"k":1}'
    assert hook.summarize("Odd", None) == "{}"


def test_hook_falls_through_at_once_without_a_connected_daemon(relay_files, capsys):
    """No daemon, or one without the device: no output, exit 0, nothing written."""
    stdin = json.dumps({"tool_name": "Bash", "tool_input": {"command": "git push"}})
    t0 = time.time()
    with patch("sys.stdin") as fake_stdin:
        fake_stdin.read.return_value = stdin
        assert hook.main([]) == 0
    assert capsys.readouterr().out == ""
    assert time.time() - t0 < 1.0
    assert not (relay_files / "approve.json").exists()

    _heartbeat(relay_files, connected=False)
    assert hook.run_hook(stdin) is None
    _heartbeat(relay_files, connected=True, age=hook.HEARTBEAT_MAX_AGE_S + 1)
    assert hook.run_hook(stdin) is None


def test_hook_allows_when_the_device_answers(relay_files, monkeypatch, capsys):
    _heartbeat(relay_files)
    seen = {}

    def device():
        # The daemon's side: watch approve.json, "press" after a moment.
        for _ in range(100):
            try:
                req = json.loads((relay_files / "approve.json").read_text())
                seen.update(req)
                break
            except (OSError, ValueError):
                time.sleep(0.02)
        mod.write_decision(seen["id"], "allow")

    t = threading.Thread(target=device)
    t.start()
    stdin = json.dumps({"tool_name": "Bash", "tool_input": {"command": "git push origin main"}})
    with patch("sys.stdin") as fake_stdin:
        fake_stdin.read.return_value = stdin
        assert hook.main([]) == 0
    t.join()
    assert json.loads(capsys.readouterr().out) == hook.ALLOW
    assert seen["tool"] == "Bash" and seen["text"] == "git push origin main" and seen["pid"] == os.getpid()
    assert not (relay_files / "approve.json").exists()           # cleaned up
    assert not list((relay_files / "decisions").iterdir())       # decision consumed


def test_hook_falls_through_when_no_answer_comes(relay_files, monkeypatch):
    _heartbeat(relay_files)
    monkeypatch.setattr(hook, "WAIT_S", 0.3)
    t0 = time.time()
    assert hook.run_hook(json.dumps({"tool_name": "Edit", "tool_input": {"file_path": "a.py"}})) is None
    assert 0.25 <= time.time() - t0 < 2.0
    assert not (relay_files / "approve.json").exists()


def test_hook_stops_waiting_when_the_daemon_disappears(relay_files, monkeypatch):
    _heartbeat(relay_files)
    monkeypatch.setattr(hook, "WAIT_S", 5.0)
    monkeypatch.setattr(hook, "HEARTBEAT_MAX_AGE_S", 0.2)
    t0 = time.time()
    assert hook.run_hook(json.dumps({"tool_name": "Bash", "tool_input": {"command": "x"}})) is None
    assert time.time() - t0 < 2.0


def test_hook_ignores_a_decision_for_another_request(relay_files, monkeypatch):
    _heartbeat(relay_files)
    monkeypatch.setattr(hook, "WAIT_S", 0.3)
    mod.write_decision("someoneelse", "allow")
    assert hook.run_hook(json.dumps({"tool_name": "Bash", "tool_input": {"command": "x"}})) is None


def test_hook_does_not_clobber_a_live_prompt_from_another_session(relay_files, monkeypatch):
    _heartbeat(relay_files)
    _write(relay_files / "approve.json",
           {"id": "other", "tool": "Bash", "text": "x", "expires": time.time() + 30, "pid": os.getpid()})
    monkeypatch.setattr(hook, "WAIT_S", 0.3)
    assert hook.run_hook(json.dumps({"tool_name": "Bash", "tool_input": {"command": "y"}})) is None
    assert json.loads((relay_files / "approve.json").read_text())["id"] == "other"


@pytest.mark.parametrize("stdin", ["", "not json", "[1]", '{"tool_input": {}}', '{"tool_name": ""}'])
def test_hook_falls_through_on_bad_input(relay_files, stdin):
    _heartbeat(relay_files)
    assert hook.run_hook(stdin) is None
    assert not (relay_files / "approve.json").exists()
