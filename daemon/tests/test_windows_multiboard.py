#!/usr/bin/env python3
"""Several bonded boards: discovery finds every one, main() links them all and mirrors.

The real PnP lookup never runs (conftest stubs it to nothing); these tests fake the
InstanceId lines Windows returns, in the shape seen on the operator's PC.

Run: python -m pytest daemon/tests/test_windows_multiboard.py -x -q
"""
import asyncio
import json
import subprocess
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import daemon.claude_usage_daemon_windows as mod
# The real lookup, taken before conftest swaps it out for every test.
from daemon.claude_usage_daemon_windows import _bonded_pnp_ids as real_bonded_pnp_ids

A = "E8:3D:C1:F7:6F:21"
B = "D4:05:92:B7:8B:E2"
ID_A = r"BTHLE\DEV_E83DC1F76F21\7&28E043A3&0&E83DC1F76F21"
ID_B = r"BTHLE\DEV_D40592B78BE2\7&3B7F5C11&0&D40592B78BE2"
USAGE = {"s": 10, "ok": True}


@pytest.fixture
def tagged_logs(monkeypatch):
    """Log lines as the file log would get them, board tag included."""
    lines = []
    monkeypatch.setattr(mod, "log", lambda msg: lines.append(mod._LOG_TAG.get() + msg))
    return lines


@pytest.fixture
def fast(monkeypatch):
    monkeypatch.setattr(mod, "TICK", 0.01)
    monkeypatch.setattr(mod, "WATCH_TICK", 0.01)
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)
    monkeypatch.setattr(mod, "CONNECT_RETRY_DELAY", 0.01)
    # main() runs on the test thread; on Windows it would hand pytest's Ctrl+C to a
    # daemon loop that is gone once the test ends.
    monkeypatch.setattr(mod.signal, "signal", lambda *_args: None)


async def until(cond, timeout=5.0):
    deadline = time.monotonic() + timeout
    while not cond():
        if time.monotonic() > deadline:
            raise AssertionError("timed out waiting for the daemon")
        await asyncio.sleep(0.01)


def _heartbeat(base):
    return json.loads((base / "daemon.heartbeat").read_text(encoding="utf-8"))["connected"]


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def test_every_bonded_board_is_found_once_in_pnp_order(monkeypatch):
    monkeypatch.setattr(mod, "_bonded_pnp_ids", lambda: [
        ID_A,
        ID_B,
        ID_A,                                               # Windows listing one board twice
        r"USB\VID_303A&PID_1001\D4:05:92:B7:8B:E0",         # not a Bluetooth address
        "",
    ])
    assert mod.discover_bonded_addresses() == [A, B]
    assert mod.discover_bonded_address() == A               # the single board lookup: the first


def test_no_bond_finds_nothing():
    assert mod.discover_bonded_addresses() == []
    assert mod.discover_bonded_address() is None


def test_the_address_pin_still_means_exactly_one_board(monkeypatch):
    monkeypatch.setenv("CLAWDMETER_BLE_ADDRESS", " e8:3d:c1:f7:6f:21 ")
    monkeypatch.setattr(mod, "_bonded_pnp_ids", lambda: pytest.fail("a pin skips the PnP lookup"))
    assert mod.discover_bonded_addresses() == [A]
    assert mod.discover_bonded_address() == A


def test_pnp_lookup_asks_for_every_board_name(monkeypatch):
    seen = {}

    def fake_run(args, **kwargs):
        seen["command"] = args[-1]
        return subprocess.CompletedProcess(args, 0, stdout=f"{ID_A}\r\n{ID_B}\r\n", stderr="")

    monkeypatch.setattr(mod, "sys", MagicMock(platform="win32"))
    monkeypatch.setattr(mod.subprocess, "run", fake_run)
    assert real_bonded_pnp_ids() == [ID_A, ID_B]
    assert all(f"'{name}'" in seen["command"] for name in mod.DEVICE_NAMES)


def test_pnp_lookup_failure_or_other_os_finds_nothing(monkeypatch):
    lines = []
    monkeypatch.setattr(mod, "log", lines.append)

    def slow_run(args, **kwargs):
        raise subprocess.TimeoutExpired(args, 10)

    monkeypatch.setattr(mod.subprocess, "run", slow_run)
    monkeypatch.setattr(mod, "sys", MagicMock(platform="win32"))
    assert real_bonded_pnp_ids() == []
    assert any("Bonded-address lookup failed" in line for line in lines)
    monkeypatch.setattr(mod, "sys", MagicMock(platform="linux"))
    assert real_bonded_pnp_ids() == []


# ---------------------------------------------------------------------------
# main(): one bond keeps the single board path exactly
# ---------------------------------------------------------------------------

def test_one_bond_keeps_the_single_board_path(fast, monkeypatch, tagged_logs):
    lookups = []
    monkeypatch.setattr(mod, "_bonded_pnp_ids", lambda: lookups.append(ID_A) or [ID_A])
    ts = MagicMock()
    calls = []

    # The old three argument shape: a fourth argument here would raise.
    async def fake_connect_and_run(device, stop_event, tray_state=None):
        calls.append(device.address)
        ts.stop_event.set()
        return True

    with patch.object(mod, "connect_and_run", side_effect=fake_connect_and_run), \
         patch.object(mod, "_run_boards", side_effect=AssertionError("one bond must not gather")):
        asyncio.run(asyncio.wait_for(mod.main(tray_state=ts), timeout=10))

    assert calls == [A]
    assert len(lookups) == 1                                        # one PowerShell run a round
    assert not any(line.startswith("[") for line in tagged_logs)   # no board tags with one board


# ---------------------------------------------------------------------------
# main(): two bonds link both boards and mirror every message
# ---------------------------------------------------------------------------

class Board:
    """A fake board behind a fake BleakClient: records what it gets, answers on TX."""

    def __init__(self, address, turns):
        self.address = address
        self.sent = []
        self.tx = None
        self.connects = 0
        self.fail_connect = False
        self._turns = turns
        self.client = MagicMock()
        self.client.is_connected = True
        self.client.disconnect = AsyncMock()
        self.client.start_notify = AsyncMock(side_effect=self._subscribe)
        self.client.connect = self._connect
        self.client.write_gatt_char = self._write

    async def _connect(self):
        self.connects += 1
        self._turns["now"] += 1
        self._turns["most"] = max(self._turns["most"], self._turns["now"])
        await asyncio.sleep(0.05)
        self._turns["now"] -= 1
        if self.fail_connect:
            raise mod.BleakError("Unreachable")

    def _subscribe(self, uuid, callback):
        if uuid == mod.TX_CHAR_UUID:
            self.tx = callback

    async def _write(self, _uuid, data, response=False):
        self.sent.append(json.loads(data))

    def press(self, msg):
        self.tx(None, bytearray(json.dumps(msg).encode()))

    def got(self, key):
        return [m for m in self.sent if key in m]


def _two_boards(monkeypatch):
    monkeypatch.setattr(mod, "_bonded_pnp_ids", lambda: [ID_A, ID_B])
    turns = {"now": 0, "most": 0}
    boards = {A: Board(A, turns), B: Board(B, turns)}
    return boards, turns


def _run(boards, scenario, timeout):
    """Drive scenario() with every BleakClient built for an address landing on that fake board."""
    with patch.object(mod, "BleakClient", side_effect=lambda device, **kw: boards[device.address].client), \
         patch.object(mod, "read_token", return_value="tok"), \
         patch.object(mod, "poll_api", new=AsyncMock(side_effect=lambda _tok: dict(USAGE))):
        asyncio.run(asyncio.wait_for(scenario(), timeout=timeout))


def test_two_bonds_link_both_boards_and_mirror_every_message(relay_files, fast, monkeypatch, tagged_logs):
    boards, turns = _two_boards(monkeypatch)
    ts = MagicMock()

    async def scenario():
        daemon = asyncio.ensure_future(mod.main(tray_state=ts))
        await until(lambda: all(b.sent for b in boards.values()))
        assert all(b.sent[0] == USAGE for b in boards.values())
        assert _heartbeat(relay_files) is True

        # every relay message goes to every board, each as its own message
        mod._write_json_atomic(relay_files / "notify.json",
                               {"title": "Build done", "body": "all green", "secs": 6, "expires": time.time() + 30})
        mod._write_json_atomic(relay_files / "page.json",
                               {"pg": "spotify", "pt": "Now playing", "pp": 5, "expires": time.time() + 30})
        mod._write_json_atomic(relay_files / "approve.json",
                               {"id": "abc123", "tool": "Bash", "text": "git push", "expires": time.time() + 30})
        await until(lambda: all(b.got("nt") and b.got("pg") and b.got("q") for b in boards.values()))
        for b in boards.values():
            assert b.got("nt") == [{"nt": "Build done", "nb": "all green", "nx": 6}]
            assert b.got("pg") == [{"pg": "spotify", "pt": "Now playing", "p1": "", "p2": "", "p3": "",
                                    "pp": 5, "pa": ""}]
            assert b.got("q")[0]["q"] == "abc123"
        # each board is on the record of boards showing a page, by its own address
        record = json.loads((relay_files / "daemon.pages").read_text(encoding="utf-8"))
        assert record == {"boards": sorted([A, B])}

        # a button on B and an approve on A both count, each tagged with its board
        boards[B].press({"btn": "aux", "scr": "page"})
        boards[A].press({"approve": "abc123"})
        events = [json.loads(p.read_text(encoding="utf-8")) for p in (relay_files / "events").iterdir()]
        assert [(e["btn"], e["scr"], e["addr"]) for e in events] == [("aux", "page", B)]
        decision = json.loads((relay_files / "decisions" / "abc123.json").read_text(encoding="utf-8"))
        assert decision["behavior"] == "allow"

        ts.stop_event.set()
        await daemon

    _run(boards, scenario, timeout=20)

    assert turns["most"] == 1                               # connects took turns
    assert _heartbeat(relay_files) is False                 # no board linked once stopped
    assert f"[{A}] Connected" in tagged_logs and f"[{B}] Connected" in tagged_logs
    ts.set_scanning.assert_not_called()


def test_one_board_dropping_leaves_the_other_linked(relay_files, fast, monkeypatch, tagged_logs):
    """Each board has its own link and its own backoff: A going away never holds up B,
    the heartbeat stays connected and the tray stays Connected while B is up, and the
    tray says Scanning only once no board is linked."""
    boards, _ = _two_boards(monkeypatch)
    ts = MagicMock()
    notify = relay_files / "notify.json"

    async def scenario():
        daemon = asyncio.ensure_future(mod.main(tray_state=ts))
        await until(lambda: all(b.sent for b in boards.values()))

        boards[A].client.is_connected = False               # A drops and stays away
        boards[A].fail_connect = True
        await until(lambda: f"[{A}] Connection lost, reconnecting in 1s..." in tagged_logs)
        assert _heartbeat(relay_files) is True               # B is still linked
        ts.set_scanning.assert_not_called()

        mod._write_json_atomic(notify, {"title": "Only B", "expires": time.time() + 30})
        await until(lambda: boards[B].got("nt"))
        assert boards[B].got("nt") == [{"nt": "Only B", "nb": "", "nx": 8}]
        assert boards[A].got("nt") == []

        # A backs off on its own schedule while B keeps working
        await until(lambda: f"[{A}] Connection lost, reconnecting in 2s..." in tagged_logs)
        assert boards[B].connects == 1

        boards[B].client.is_connected = False               # now neither board is linked
        boards[B].fail_connect = True
        await until(lambda: ts.set_scanning.called)
        assert _heartbeat(relay_files) is False

        ts.stop_event.set()
        await daemon

    _run(boards, scenario, timeout=30)
