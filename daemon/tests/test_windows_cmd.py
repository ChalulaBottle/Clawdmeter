#!/usr/bin/env python3
"""The cmd message: cmd/<ns>.json out to every linked board, the boards' answers into board/.

conftest points CMD_DIR, BOARD_DIR and every relay file at tmp_path; the live
%LOCALAPPDATA%\\Clawdmeter is never touched. A board here is a fake BleakClient that keeps every
message and answers each cmd on TX the way the firmware does (cmd.cpp), with the plain nack the
way firmware from before the cmd message does, or not at all.

Run: python -m pytest daemon/tests/test_windows_cmd.py -x -q
"""
import ast
import asyncio
import json
import math
import os
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bleak.backends.device import BLEDevice

import daemon.claude_usage_daemon_windows as mod

USAGE = {"s": 10, "ok": True}
PAGE = {"pg": "spotify", "pt": "Now playing", "p1": "Song", "p2": "Artist",
        "p3": "Desk speaker", "pp": 10, "pa": "echo headphones"}
BOARD = "E8:3D:C1:F7:6F:21"
BOARD_B = "D4:05:92:B7:8B:E2"
STATUS = {"c": "status", "v": ""}
BRIGHT = {"c": "bright", "v": "40"}
REPORT = {"c": "status", "br": 77, "scr": "splash", "an": "echo dj", "fw": "Waveshare LCD 4", "n": 83}
FIELDS = {k: v for k, v in REPORT.items() if k != "c"}
BIG = "1" + "0" * 400   # a JSON integer too long for a float


@pytest.fixture(autouse=True)
def link_status(relay_files, monkeypatch):
    """conftest turns the new link's status cmd off for the other tests; here it is on, as in
    the module (test_every_link_asks_for_the_report)."""
    monkeypatch.setattr(mod, "LINK_STATUS", dict(STATUS))


@pytest.fixture
def logs(monkeypatch):
    lines = []
    monkeypatch.setattr(mod, "log", lines.append)
    return lines


@pytest.fixture
def fast(monkeypatch):
    """Tick quickly and do not space writes out (the gap has tests of its own)."""
    monkeypatch.setattr(mod, "TICK", 0.01)
    monkeypatch.setattr(mod, "WATCH_TICK", 0.01)
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)


def _cmd(base, name, obj):
    """cmd/<name> the way the engine drops it: whole, by atomic replace."""
    mod._write_json_atomic(base / "cmd" / name, obj)


def _live(**fields):
    return {"expires": time.time() + 30, **fields}


def _report(base, address=BOARD):
    return json.loads((base / "board" / f"{address.replace(':', '-')}.json").read_text(encoding="utf-8"))


def _reports(base):
    folder = base / "board"
    return sorted(os.listdir(folder)) if folder.exists() else []


class Board:
    """A board behind a fake BleakClient. Every message written to it is kept in order. A cmd
    is answered on TX right after the write, as cmd.cpp answers it ("cmd"), with the plain nack
    of firmware from before the cmd message ("old"), or not at all ("mute"); anything else gets
    the plain ack."""

    def __init__(self, firmware="cmd", tx=True):
        self.sent = []
        self.tx = None
        self.firmware = firmware
        self.client = MagicMock()
        self.client.is_connected = True
        self.client.mtu_size = 256
        self.client.connect = AsyncMock()
        self.client.disconnect = AsyncMock()
        if tx:
            self.client.start_notify = AsyncMock(side_effect=self._subscribe)
        else:
            self.client.start_notify = AsyncMock(side_effect=mod.BleakError("Could not start notify"))
        self.client.write_gatt_char = self._write

    def _subscribe(self, uuid, callback):
        if uuid == mod.TX_CHAR_UUID:
            self.tx = callback

    async def _write(self, _uuid, data, response=None):
        msg = json.loads(bytes(data))
        self.sent.append(msg)
        answer = self.answer_to(msg)
        if answer is not None and self.tx is not None:
            asyncio.get_running_loop().call_soon(self.say, answer)

    def answer_to(self, msg):
        if "c" not in msg or "s" in msg:
            return {"ack": True}
        if self.firmware == "old":
            return {"err": True}
        if self.firmware == "mute":
            return None
        return dict(REPORT) if msg["c"] == "status" else {"c": msg["c"], "ok": 1}

    def say(self, msg):
        self.tx(None, bytearray(json.dumps(msg).encode()))

    def cmds(self):
        return [m for m in self.sent if "c" in m and "s" not in m]


async def until(cond, timeout=5.0):
    deadline = time.monotonic() + timeout
    while not cond():
        if time.monotonic() > deadline:
            raise AssertionError("timed out waiting for the daemon")
        await asyncio.sleep(0.01)


def _drive(boards, scenario, device=None, timeout=15):
    """Link every board in `boards` (address: Board) while `scenario()` acts on the files. One
    board gets the single link of connect_and_run (on `device` when given); several get one
    _board_link each, as main() gives them."""
    async def run():
        stop_event = asyncio.Event()
        if len(boards) == 1:
            address = next(iter(boards))
            links = [asyncio.ensure_future(
                mod.connect_and_run(device or MagicMock(address=address), stop_event))]
        else:
            turn = asyncio.Lock()
            links = [asyncio.ensure_future(mod._board_link(a, stop_event, None, turn)) for a in boards]
        try:
            await scenario()
        finally:
            stop_event.set()
            await asyncio.gather(*links)

    with patch.object(mod, "BleakClient", side_effect=lambda device, **kw: boards[device.address].client), \
         patch.object(mod, "read_token", return_value="tok"), \
         patch.object(mod, "poll_api", new=AsyncMock(side_effect=lambda _tok: dict(USAGE))):
        asyncio.run(asyncio.wait_for(run(), timeout=timeout))


def _session(address=BOARD):
    return mod.Session(MagicMock(), address)


def _hear(session, msg):
    session._on_tx(None, bytearray(json.dumps(msg).encode()))


# ---------------------------------------------------------------------------
# The contract
# ---------------------------------------------------------------------------

def test_the_protocol_constants(relay_files):
    assert mod.CMD_DIR == relay_files / "cmd"            # conftest keeps both away from the live folder
    assert mod.BOARD_DIR == relay_files / "board"
    assert mod.CMD_VERB_MAX == 15
    assert mod.CMD_VALUE_MAX == 32
    assert mod.CMD_NACK_WAIT == 2.0
    assert mod.CMD_PER_TICK == 4
    assert mod.CMD_OLD_FIRMWARE == "old firmware"
    assert set(mod.STATUS_FIELDS) == {"br", "scr", "an", "fw", "n"}


def test_every_link_asks_for_the_report():
    """The module's own LINK_STATUS, read from its source: conftest patches the attribute."""
    tree = ast.parse(Path(mod.__file__).read_text(encoding="utf-8"))
    values = [ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
              and any(getattr(target, "id", None) == "LINK_STATUS" for target in node.targets)]
    assert values == [STATUS]


# ---------------------------------------------------------------------------
# read_cmd_file: one file to one board message
# ---------------------------------------------------------------------------

def test_a_cmd_file_becomes_c_and_v_and_its_expiry(relay_files, logs):
    expires = time.time() + 30
    _cmd(relay_files, "1.json", {"c": "bright", "v": "40", "expires": expires})
    assert mod.read_cmd_file(relay_files / "cmd" / "1.json") == (BRIGHT, expires)
    assert logs == []


@pytest.mark.parametrize("value, sent", [(40, "40"), (0, "0"), (None, ""), ("echo dj", "echo dj")])
def test_a_whole_number_goes_as_its_digits_and_no_value_is_empty(relay_files, logs, value, sent):
    _cmd(relay_files, "1.json", _live(c="bright", v=value))
    assert mod.read_cmd_file(relay_files / "cmd" / "1.json")[0] == {"c": "bright", "v": sent}


def test_a_missing_value_is_empty(relay_files, logs):
    _cmd(relay_files, "1.json", _live(c="status"))
    assert mod.read_cmd_file(relay_files / "cmd" / "1.json")[0] == STATUS


def test_an_anim_with_no_name_goes_as_it_is(relay_files, logs):
    """The engine's board release(): the firmware takes anim with an empty value as let go."""
    _cmd(relay_files, "1.json", _live(c="anim", v=""))
    assert mod.read_cmd_file(relay_files / "cmd" / "1.json")[0] == {"c": "anim", "v": ""}
    assert logs == []


@pytest.mark.parametrize("value", [True, 4.5, [1], {"a": 1}])
def test_a_value_that_is_not_text_is_malformed(relay_files, logs, value):
    _cmd(relay_files, "1.json", _live(c="bright", v=value))
    assert mod.read_cmd_file(relay_files / "cmd" / "1.json") is None
    assert len(logs) == 1 and "malformed" in logs[0]


def test_a_value_is_never_cut(relay_files, logs):
    """A cut creature name would name another creature or none: a long one is refused whole."""
    path = relay_files / "cmd" / "1.json"
    _cmd(relay_files, "1.json", _live(c="anim", v="x" * 32))
    assert mod.read_cmd_file(path)[0]["v"] == "x" * 32
    _cmd(relay_files, "1.json", _live(c="anim", v="x" * 33))
    assert mod.read_cmd_file(path) is None
    e_acute = chr(0xE9)                                                       # 2 bytes of UTF-8
    _cmd(relay_files, "1.json", _live(c="anim", v=e_acute * 16))              # 32 bytes
    assert mod.read_cmd_file(path)[0]["v"] == e_acute * 16
    _cmd(relay_files, "1.json", _live(c="anim", v=e_acute * 16 + "a"))        # 33
    assert mod.read_cmd_file(path) is None


def test_a_lone_surrogate_in_a_value_is_malformed_not_raised(relay_files, logs):
    path = relay_files / "cmd" / "1.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"c": "anim", "v": "a\\ud800", "expires": %d}' % (time.time() + 30), encoding="utf-8")
    assert mod.read_cmd_file(path) is None


@pytest.mark.parametrize("verb", ["", "bright now", "../x", "x" * 16, 5, None, True, "br" + chr(0xEF) + "ght", "bright\n"])
def test_a_verb_of_any_other_shape_is_malformed(relay_files, logs, verb):
    _cmd(relay_files, "1.json", _live(c=verb, v=""))
    assert mod.read_cmd_file(relay_files / "cmd" / "1.json") is None
    assert len(logs) == 1 and "malformed" in logs[0]


@pytest.mark.parametrize("expires", ["missing", None, "soon", True, -1])
def test_an_expired_or_undated_cmd_is_dropped(relay_files, logs, expires):
    obj = {"c": "bright", "v": "40"}
    if expires != "missing":
        obj["expires"] = expires
    _cmd(relay_files, "1.json", obj)
    assert mod.read_cmd_file(relay_files / "cmd" / "1.json") is None
    assert logs == ["Cmd 1.json (bright) expired before a board took it, dropped"]


@pytest.mark.parametrize("expires", ["NaN", "Infinity", BIG])
def test_an_expiry_that_is_no_usable_number_is_expired_not_raised(relay_files, logs, expires):
    path = relay_files / "cmd" / "1.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"c": "bright", "v": "1", "expires": %s}' % expires, encoding="utf-8")
    assert mod.read_cmd_file(path) is None


@pytest.mark.parametrize("content", ["{oops", "[]", '"bright"', ""])
def test_malformed_json_is_dropped_with_a_log_line(relay_files, logs, content):
    path = relay_files / "cmd" / "1.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    assert mod.read_cmd_file(path) is None
    assert len(logs) == 1 and logs[0].startswith("Cmd 1.json malformed")


@pytest.mark.parametrize("encoding", ["utf-8-sig", "utf-16"])
def test_a_cmd_file_from_powershell_still_parses(relay_files, logs, encoding):
    path = relay_files / "cmd" / "1.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_live(c="screen", v="page")), encoding=encoding)
    assert mod.read_cmd_file(path)[0] == {"c": "screen", "v": "page"}


def test_a_file_that_will_not_open_raises_for_the_caller(relay_files, logs, monkeypatch):
    path = relay_files / "cmd" / "1.json"
    _cmd(relay_files, "1.json", _live(c="status"))

    def held(self):
        raise PermissionError(13, "The process cannot access the file")

    monkeypatch.setattr(Path, "read_bytes", held)
    with pytest.raises(PermissionError):
        mod.read_cmd_file(path)
    assert logs == []


# ---------------------------------------------------------------------------
# take_cmds: every file once to every linked board, then the file goes
# ---------------------------------------------------------------------------

def test_each_cmd_goes_to_every_linked_board_in_name_order_and_the_file_goes(relay_files, logs):
    a, b = _session(BOARD), _session(BOARD_B)
    mod._LIVE_LINKS.update({a, b})
    _cmd(relay_files, "1700000000000000002.json", _live(c="anim", v="echo dj"))
    _cmd(relay_files, "1700000000000000001.json", _live(c="bright", v="40"))
    folder = relay_files / "cmd"
    (folder / ".1700000000000000003.json.4242.tmp").write_text("{}", encoding="utf-8")   # still being written
    (folder / "notes.txt").write_text("not a cmd", encoding="utf-8")

    mod.take_cmds()
    for session in (a, b):
        assert [m for m, _ in session._cmds] == [BRIGHT, {"c": "anim", "v": "echo dj"}]
    assert sorted(os.listdir(folder)) == [".1700000000000000003.json.4242.tmp", "notes.txt"]
    mod.take_cmds()                                       # nothing is handed out twice
    assert len(a._cmds) == len(b._cmds) == 2
    assert logs == []


def test_a_dropped_cmd_reaches_no_board_and_its_file_goes(relay_files, logs):
    a = _session()
    mod._LIVE_LINKS.add(a)
    _cmd(relay_files, "1.json", {"c": "bright", "v": "40", "expires": time.time() - 1})
    _cmd(relay_files, "2.json", _live(c="bright now"))
    mod.take_cmds()
    assert a._cmds == []
    assert os.listdir(relay_files / "cmd") == []
    assert len(logs) == 2


def test_no_cmd_folder_is_nothing_to_do(relay_files, logs):
    a = _session()
    mod._LIVE_LINKS.add(a)
    mod.take_cmds()
    assert a._cmds == [] and logs == []


def test_an_unreadable_cmd_is_read_again_each_tick_and_logged_once(relay_files, logs, monkeypatch):
    a = _session()
    mod._LIVE_LINKS.add(a)
    _cmd(relay_files, "1.json", _live(c="status"))
    real = mod.read_cmd_file
    held = [True]

    def read(path):
        if held[0]:
            raise PermissionError(13, "The process cannot access the file")
        return real(path)

    monkeypatch.setattr(mod, "read_cmd_file", read)
    mod.take_cmds()
    mod.take_cmds()
    assert a._cmds == [] and (relay_files / "cmd" / "1.json").exists()
    assert logs == ["Cmd 1.json unreadable, will try again: The process cannot access the file"]
    held[0] = False
    mod.take_cmds()
    assert [m for m, _ in a._cmds] == [STATUS]
    assert not (relay_files / "cmd" / "1.json").exists()


def test_an_unreadable_cmd_holds_back_the_ones_after_it(relay_files, logs, monkeypatch):
    """bright 10, 40, 80 with 40 held by another program for a tick: 10 goes, 80 waits for 40,
    so the board ends at 80, the level asked for last, and not at 40."""
    a = _session()
    mod._LIVE_LINKS.add(a)
    names = [f"170000000000000000{n}.json" for n in (1, 2, 3)]
    for name, level in zip(names, ("10", "40", "80")):
        _cmd(relay_files, name, _live(c="bright", v=level))
    real = mod.read_cmd_file
    held = {names[1]}

    def read(path):
        if path.name in held:
            raise PermissionError(13, "The process cannot access the file")
        return real(path)

    monkeypatch.setattr(mod, "read_cmd_file", read)
    mod.take_cmds()
    assert [m["v"] for m, _ in a._cmds] == ["10"]
    assert sorted(os.listdir(relay_files / "cmd")) == names[1:]
    held.clear()
    mod.take_cmds()
    assert [m["v"] for m, _ in a._cmds] == ["10", "40", "80"]
    assert os.listdir(relay_files / "cmd") == []
    assert logs == [f"Cmd {names[1]} unreadable, will try again: The process cannot access the file"]


def test_a_file_taken_back_by_its_writer_is_skipped_quietly(relay_files, logs, monkeypatch):
    a = _session()
    mod._LIVE_LINKS.add(a)
    _cmd(relay_files, "1.json", _live(c="status"))

    def gone(path):
        raise FileNotFoundError(2, "No such file")

    monkeypatch.setattr(mod, "read_cmd_file", gone)
    mod.take_cmds()
    assert a._cmds == [] and logs == []


def test_a_cmd_whose_file_will_not_go_is_never_handed_out_again(relay_files, logs, monkeypatch):
    a = _session()
    mod._LIVE_LINKS.add(a)
    _cmd(relay_files, "1.json", _live(c="dance", v="next"))
    real_unlink = Path.unlink
    stuck = [True]

    def unlink(self, missing_ok=False):
        if stuck[0] and self.name == "1.json":
            raise PermissionError(13, "Access is denied")
        return real_unlink(self, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", unlink)
    mod.take_cmds()
    mod.take_cmds()
    mod.take_cmds()
    assert [m for m, _ in a._cmds] == [{"c": "dance", "v": "next"}]         # once, however often it is seen
    assert logs == ["Cmd 1.json not removed yet, it will not go again: Access is denied"]
    stuck[0] = False
    mod.take_cmds()
    assert not (relay_files / "cmd" / "1.json").exists()
    assert mod._CMD_TAKEN == set()
    assert len(a._cmds) == 1


def test_with_no_board_linked_a_cmd_waits_for_one(relay_files, logs):
    """Every link's tick calls take_cmds, so with none there is nobody to call it; the first link
    takes what is still live then."""
    _cmd(relay_files, "1.json", _live(c="status"))
    a = _session()
    mod._LIVE_LINKS.add(a)
    mod.take_cmds()
    assert [m for m, _ in a._cmds] == [STATUS]


# ---------------------------------------------------------------------------
# Session.send_cmds: this board's share, on its own tick
# ---------------------------------------------------------------------------

def test_a_cmd_that_lapsed_while_it_waited_is_dropped(logs):
    board = Board()
    s = mod.Session(board.client, BOARD)
    s.queue_cmd(BRIGHT, time.time() - 1)
    s.queue_cmd(STATUS, math.inf)
    asyncio.run(s.send_cmds())
    assert board.sent == [STATUS]
    assert "Cmd bright expired before it went, dropped" in logs


def test_a_cmd_that_went_waits_for_its_answer_and_a_failed_one_does_not(logs):
    s = mod.Session(Board().client, BOARD)
    s.queue_cmd(BRIGHT, math.inf)
    asyncio.run(s.send_cmds())
    assert s._cmd_waiting[0] == "bright"

    failing = MagicMock()
    failing.write_gatt_char = AsyncMock(side_effect=mod.BleakError("Unreachable"))
    s = mod.Session(failing, BOARD)
    s.queue_cmd(BRIGHT, math.inf)
    asyncio.run(s.send_cmds())
    assert s._cmd_waiting is None and s._cmds == []


def test_a_pile_of_cmds_goes_out_a_few_a_tick(logs, monkeypatch):
    """Writes keep WRITE_GAP apart, so a tick that sent all of a pile would hold up the heartbeat,
    prompts and Quit; CMD_PER_TICK a tick, oldest first, and the rest on the ticks after."""
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)
    board = Board()
    s = mod.Session(board.client, BOARD)
    verbs = [{"c": "bright", "v": str(n)} for n in range(10)]
    for msg in verbs:
        s.queue_cmd(msg, math.inf)

    async def ticks():
        sent = []
        for _ in range(3):
            await s.send_cmds()
            sent.append(len(board.sent))
        return sent

    assert asyncio.run(ticks()) == [4, 8, 10]
    assert board.sent == verbs and s._cmds == []


# ---------------------------------------------------------------------------
# Session._on_tx: the board's answers into board/<address>.json
# ---------------------------------------------------------------------------

def test_an_ok_becomes_last_and_shows_the_board_takes_cmds(relay_files, logs):
    s = _session()
    _hear(s, {"c": "bright", "ok": 1})
    report = _report(relay_files)
    assert abs(report.pop("ts") - time.time()) < 5
    assert report == {"cmd": True, "last": {"c": "bright", "ok": 1}, "addr": BOARD, "name": mod.DEVICE_NAME}
    assert _reports(relay_files) == ["E8-3D-C1-F7-6F-21.json"]                 # dashes for the colons
    assert logs == [f"Cmd bright done ({BOARD})"]


def test_a_refusal_keeps_its_reason(relay_files, logs):
    s = _session()
    _hear(s, {"c": "screen", "err": "no page"})
    assert _report(relay_files)["last"] == {"c": "screen", "err": "no page"}
    assert _report(relay_files)["cmd"] is True                                  # a refusal is still an answer
    assert logs == [f"Cmd screen refused: no page ({BOARD})"]


@pytest.mark.parametrize("why, kept", [("x" * 40, "x" * 23), (True, "?"), ("", "?"), (None, "?")])
def test_a_reason_is_kept_short_and_text(relay_files, logs, why, kept):
    s = _session()
    _hear(s, {"c": "bright", "err": why})
    assert _report(relay_files)["last"] == {"c": "bright", "err": kept}


def test_a_status_report_fills_the_file_and_later_answers_keep_it(relay_files, logs):
    s = _session()
    _hear(s, REPORT)
    report = _report(relay_files)
    assert {k: report[k] for k in FIELDS} == FIELDS
    assert report["last"] == {"c": "status", "ok": 1}
    _hear(s, {"c": "bright", "ok": 1})
    report = _report(relay_files)
    assert {k: report[k] for k in FIELDS} == FIELDS                             # the report stays until the next one
    assert report["last"] == {"c": "bright", "ok": 1}
    _hear(s, {"c": "status", "br": 40, "scr": "page", "an": "", "fw": "Waveshare LCD 4"})
    report = _report(relay_files)
    assert (report["br"], report["scr"], report["an"]) == (40, "page", "")
    assert "n" not in report                                                    # a new report replaces the old one whole


@pytest.mark.parametrize("field, value", [
    ("br", True), ("br", 101), ("br", -2), ("br", "50"), ("br", 4.5),
    ("scr", "../x"), ("scr", ""), ("scr", 3),
    ("an", "x" * 24), ("an", None),
    ("fw", ""), ("fw", "x" * 41), ("fw", 1),
    ("n", -1), ("n", 1.5), ("n", "83"), ("n", False),
])
def test_a_status_field_that_fails_its_check_is_left_out_and_the_rest_kept(relay_files, logs, field, value):
    s = _session()
    _hear(s, {**REPORT, field: value})
    report = _report(relay_files)
    assert field not in report
    assert {k: report[k] for k in FIELDS if k != field} == {k: v for k, v in FIELDS.items() if k != field}


def test_a_board_that_cannot_set_brightness_reports_br_minus_one(relay_files, logs):
    s = _session()
    _hear(s, {**REPORT, "br": -1})
    assert _report(relay_files)["br"] == -1


def test_an_unknown_verb_comes_back_as_a_question_mark(relay_files, logs):
    s = _session()
    _hear(s, {"c": "?", "err": "verb"})
    assert _report(relay_files)["last"] == {"c": "?", "err": "verb"}


@pytest.mark.parametrize("verb", [5, None, "a b", "../x", "x" * 16])
def test_an_answer_with_a_bad_verb_is_ignored(relay_files, logs, verb):
    s = _session()
    _hear(s, {"c": verb, "ok": 1})
    assert _reports(relay_files) == []
    assert len(logs) == 1 and logs[0].startswith("Device answered a cmd with a bad verb")


def test_a_plain_nack_right_after_a_cmd_marks_old_firmware(relay_files, logs):
    s = _session()
    s._cmd_waiting = ("status", time.monotonic())
    _hear(s, {"err": True})
    report = _report(relay_files)
    assert report["cmd"] is False
    assert report["last"] == {"c": "status", "err": "old firmware"}
    assert logs == [f"Cmd status answered with a plain nack: firmware without the cmd message ({BOARD})"]
    s._cmd_waiting = ("bright", time.monotonic())
    _hear(s, {"err": True})
    assert _report(relay_files)["last"] == {"c": "bright", "err": "old firmware"}
    assert len(logs) == 1                                                       # said once a link


def test_a_plain_nack_with_no_cmd_waiting_is_left_alone(relay_files, logs):
    s = _session()
    _hear(s, {"err": True})
    assert _reports(relay_files) == [] and logs == []


def test_a_plain_nack_after_the_wait_is_left_alone(relay_files, logs):
    s = _session()
    s._cmd_waiting = ("status", time.monotonic() - mod.CMD_NACK_WAIT - 1)
    _hear(s, {"err": True})
    assert _reports(relay_files) == []


def test_a_plain_nack_settles_the_wait_either_way(relay_files, logs):
    """A nack is the answer to one message; a second one never counts against the same cmd."""
    s = _session()
    s._cmd_waiting = ("status", time.monotonic() - mod.CMD_NACK_WAIT - 1)
    _hear(s, {"err": True})
    assert s._cmd_waiting is None


def test_a_wifi_refusal_is_not_a_plain_nack(relay_files, logs):
    s = _session()
    s._cmd_waiting = ("status", time.monotonic())
    _hear(s, {"err": True, "wf": "no"})
    assert _reports(relay_files) == []
    assert s._cmd_waiting is not None


def test_an_ack_does_not_end_the_wait(relay_files, logs):
    """Answers come in the order of the writes; a plain ack belongs to the message before."""
    s = _session()
    s._cmd_waiting = ("status", time.monotonic())
    _hear(s, {"ack": True})
    _hear(s, {"err": True})
    assert _report(relay_files)["cmd"] is False


def test_a_proper_answer_marks_the_board_as_taking_cmds_again(relay_files, logs):
    """A plain nack from another message, read as the cmd's, puts it right at the next answer."""
    s = _session()
    s._cmd_waiting = ("status", time.monotonic())
    _hear(s, {"err": True})
    _hear(s, REPORT)
    report = _report(relay_files)
    assert report["cmd"] is True and report["br"] == 77
    assert s._cmd_waiting is None


@pytest.mark.parametrize("address", ["", "not-an-address", "../../E8:3D:C1:F7:6F:21", "E8:3D:C1:F7:6F"])
def test_a_link_without_a_usual_address_writes_no_report(relay_files, logs, address):
    s = mod.Session(MagicMock(), address)
    _hear(s, REPORT)
    assert _reports(relay_files) == []
    assert not list(relay_files.parent.glob("*.json"))                          # and nothing beside it


def test_a_report_write_failure_is_logged_not_raised(relay_files, logs, monkeypatch):
    def refuse(path, obj):
        raise PermissionError(13, "Access is denied")

    monkeypatch.setattr(mod, "_write_json_atomic", refuse)
    s = _session()
    _hear(s, {"c": "bright", "ok": 1})
    assert any(line.startswith("Board report write failed") for line in logs)


def test_the_other_answers_on_tx_are_untouched(relay_files, logs):
    s = _session()
    _hear(s, {"btn": "pwr", "scr": "page"})
    _hear(s, {"approve": "abc123"})
    assert _reports(relay_files) == []
    assert len(os.listdir(relay_files / "events")) == 1
    assert (relay_files / "decisions" / "abc123.json").exists()


# ---------------------------------------------------------------------------
# connect_and_run: the report on every new link, cmds out, answers in
# ---------------------------------------------------------------------------

def test_a_new_link_asks_the_board_for_its_report_once(relay_files, logs, fast):
    board = Board()

    async def scenario():
        await until(lambda: (relay_files / "board").exists() and _reports(relay_files))
        await asyncio.sleep(0.2)                                                # plenty of ticks

    _drive({BOARD: board}, scenario)
    assert board.sent[:2] == [STATUS, USAGE]
    assert board.cmds() == [STATUS]
    report = _report(relay_files)
    assert {k: report[k] for k in FIELDS} == FIELDS
    assert report["cmd"] is True and report["name"] == mod.DEVICE_NAME and report["addr"] == BOARD


def test_the_report_comes_after_a_live_page(relay_files, logs, fast):
    mod._write_json_atomic(relay_files / "page.json", {**PAGE, "expires": time.time() + 60})
    board = Board()

    async def scenario():
        await until(lambda: len(board.sent) >= 3)

    _drive({BOARD: board}, scenario)
    assert board.sent[:3] == [PAGE, STATUS, USAGE]


def test_a_link_that_cannot_hear_the_board_asks_for_no_report(relay_files, logs, fast):
    board = Board(tx=False)

    async def scenario():
        await until(lambda: USAGE in board.sent)
        await asyncio.sleep(0.2)

    _drive({BOARD: board}, scenario)
    assert board.cmds() == []


def test_a_cmd_goes_out_as_its_own_message_and_its_file_goes(relay_files, logs, fast):
    board = Board()

    async def scenario():
        await until(lambda: _reports(relay_files))
        _cmd(relay_files, f"{time.time_ns()}.json", _live(c="bright", v="40"))
        await until(lambda: _report(relay_files)["last"] == {"c": "bright", "ok": 1})

    _drive({BOARD: board}, scenario)
    assert board.cmds() == [STATUS, BRIGHT]
    assert os.listdir(relay_files / "cmd") == []
    assert f"Cmd bright done ({BOARD})" in logs


def test_cmds_waiting_before_the_link_go_out_on_its_first_tick_in_name_order(relay_files, logs, fast):
    _cmd(relay_files, "1700000000000000002.json", _live(c="screen", v="splash"))
    _cmd(relay_files, "1700000000000000001.json", _live(c="anim", v="echo dj"))
    board = Board()

    async def scenario():
        await until(lambda: USAGE in board.sent)

    _drive({BOARD: board}, scenario)
    assert board.sent[:4] == [STATUS, {"c": "anim", "v": "echo dj"}, {"c": "screen", "v": "splash"}, USAGE]


def test_cmds_beyond_one_tick_go_on_the_next_ticks(relay_files, logs, fast):
    """Nine waiting when the link comes up: its first tick sends the report request and three of
    them, then the usage poll goes out; the other six follow on the next ticks, in name order."""
    verbs = [{"c": "bright", "v": str(n)} for n in range(9)]
    for n, msg in enumerate(verbs):
        _cmd(relay_files, f"170000000000000000{n}.json", _live(**msg))
    board = Board()

    async def scenario():
        await until(lambda: len(board.cmds()) == 10)

    _drive({BOARD: board}, scenario)
    assert board.cmds() == [STATUS, *verbs]
    assert board.sent[:board.sent.index(USAGE)] == [STATUS, *verbs[:3]]


def test_an_expired_cmd_never_reaches_a_board(relay_files, logs, fast):
    _cmd(relay_files, "1.json", {"c": "bright", "v": "40", "expires": time.time() - 5})
    board = Board()

    async def scenario():
        await until(lambda: USAGE in board.sent)
        await asyncio.sleep(0.1)

    _drive({BOARD: board}, scenario)
    assert board.cmds() == [STATUS]
    assert not (relay_files / "cmd" / "1.json").exists()


def test_every_linked_board_gets_each_cmd_once(relay_files, logs, fast):
    a, b = Board(), Board()

    async def scenario():
        await until(lambda: len(_reports(relay_files)) == 2)
        _cmd(relay_files, f"{time.time_ns()}.json", _live(c="dance", v="next"))
        await until(lambda: all(_report(relay_files, x)["last"]["c"] == "dance" for x in (BOARD, BOARD_B)))
        await asyncio.sleep(0.2)                                                # both links tick on

    _drive({BOARD: a, BOARD_B: b}, scenario)
    assert a.cmds() == b.cmds() == [STATUS, {"c": "dance", "v": "next"}]
    assert os.listdir(relay_files / "cmd") == []
    assert _reports(relay_files) == ["D4-05-92-B7-8B-E2.json", "E8-3D-C1-F7-6F-21.json"]


def test_old_firmware_is_marked_as_taking_no_cmds(relay_files, logs, fast):
    board = Board(firmware="old")

    async def scenario():
        await until(lambda: _reports(relay_files))
        _cmd(relay_files, f"{time.time_ns()}.json", _live(c="bright", v="40"))
        await until(lambda: _report(relay_files)["last"]["c"] == "bright")

    _drive({BOARD: board}, scenario)
    report = _report(relay_files)
    assert report["cmd"] is False
    assert report["last"] == {"c": "bright", "err": "old firmware"}
    assert not any(k in report for k in FIELDS)
    assert sum("plain nack" in line for line in logs) == 1


def test_a_board_that_never_answers_gets_no_report(relay_files, logs, fast):
    board = Board(firmware="mute")

    async def scenario():
        await until(lambda: USAGE in board.sent)
        await asyncio.sleep(0.1)

    _drive({BOARD: board}, scenario)
    assert board.cmds() == [STATUS]
    assert _reports(relay_files) == []


def test_the_report_names_the_board_as_its_device_does(relay_files, logs, fast):
    board = Board()

    async def scenario():
        await until(lambda: _reports(relay_files))

    _drive({BOARD: board}, scenario, device=BLEDevice(BOARD, "ECHO_MiniDaemon", None))
    assert _report(relay_files)["name"] == "ECHO_MiniDaemon"


def test_a_cmd_is_never_waited_on(relay_files, logs, fast):
    """The tick loop goes on while a board says nothing: the usage poll and a notification
    still go out after a cmd nobody answers."""
    board = Board(firmware="mute")

    async def scenario():
        await until(lambda: USAGE in board.sent)
        _cmd(relay_files, f"{time.time_ns()}.json", _live(c="bright", v="40"))
        await until(lambda: BRIGHT in board.sent)
        mod._write_json_atomic(relay_files / "notify.json",
                               {"title": "Build done", "body": "", "expires": time.time() + 30})
        await until(lambda: any("nt" in m for m in board.sent))

    _drive({BOARD: board}, scenario)
    assert board.sent.index(BRIGHT) < next(i for i, m in enumerate(board.sent) if "nt" in m)
