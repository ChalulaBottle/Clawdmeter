#!/usr/bin/env python3
"""LabDaemon relay: notify.json and page.json out to the board, button presses back to events/.

conftest points every relay file at tmp_path; the live %LOCALAPPDATA%\\Clawdmeter
is never touched.

Run: python -m pytest daemon/tests/test_windows_relay.py -x -q
"""
import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import daemon.claude_usage_daemon_windows as mod

USAGE = {"s": 10, "ok": True}
PAGE = {"pg": "spotify", "pt": "Now playing", "p1": "Song", "p2": "Artist",
        "p3": "Desk speaker", "pp": 10, "pa": "echo headphones"}
# asyncio on Windows fires a timer up to one clock step (15.6 ms) early, and
# time.monotonic() moves in the same steps, so a measured gap comes out a little short.
CLOCK_SLACK = 0.04
# A JSON integer too long for a float, well inside Python's 4300 digit parse limit.
BIG = "1" + "0" * 400
BOARD = "E8:3D:C1:F7:6F:21"


@pytest.fixture
def logs(monkeypatch):
    lines = []
    monkeypatch.setattr(mod, "log", lines.append)
    return lines


@pytest.fixture
def fast(monkeypatch):
    """Tick the loop quickly and do not space writes out (the gap has tests of its own)."""
    monkeypatch.setattr(mod, "TICK", 0.01)
    monkeypatch.setattr(mod, "WATCH_TICK", 0.01)
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)


def _write(path, obj):
    """Drop a relay file the way the engine does: whole, by atomic replace."""
    mod._write_json_atomic(path, obj)


def _write_raw(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


async def until(cond, timeout=5.0):
    deadline = time.monotonic() + timeout
    while not cond():
        if time.monotonic() > deadline:
            raise AssertionError("timed out waiting for the daemon")
        await asyncio.sleep(0.01)


def _drive(write, scenario, device=None):
    """Run connect_and_run against a fake board while `scenario(stop_event)` acts on the files.

    `device` names the board (a MagicMock with .address); by default it has no address."""
    client = AsyncMock()
    client.connect = AsyncMock(return_value=None)
    client.is_connected = True
    client.disconnect = AsyncMock()
    client.start_notify = AsyncMock()
    client.write_gatt_char = write

    async def run():
        stop_event = asyncio.Event()
        link = asyncio.ensure_future(mod.connect_and_run(device or MagicMock(), stop_event))
        try:
            await scenario(stop_event)
        finally:
            stop_event.set()
            await link

    with patch.object(mod, "BleakClient", return_value=client), \
         patch.object(mod, "read_token", return_value="tok"), \
         patch.object(mod, "poll_api", new=AsyncMock(side_effect=lambda _tok: dict(USAGE))):
        asyncio.run(asyncio.wait_for(run(), timeout=15))


def _recorder():
    sent, times = [], []

    async def write(_uuid, data, response=False):
        sent.append(json.loads(data))
        times.append(time.monotonic())

    return sent, times, write


# ---------------------------------------------------------------------------
# read_notify_msg: file to device message
# ---------------------------------------------------------------------------

def test_live_notification_becomes_nt_nb_nx(relay_files, logs):
    _write(relay_files / "notify.json",
           {"title": "Build done", "body": "all green", "secs": 5, "expires": time.time() + 30})
    assert mod.read_notify_msg() == {"nt": "Build done", "nb": "all green", "nx": 5}


def test_notification_defaults_and_panel_caps(relay_files, logs):
    path = relay_files / "notify.json"
    _write(path, {"title": "t" * 40, "body": "b" * 300, "expires": time.time() + 30})
    msg = mod.read_notify_msg()
    assert msg == {"nt": "t" * mod.NOTIFY_TITLE_MAX, "nb": "b" * mod.NOTIFY_BODY_MAX,
                   "nx": mod.NOTIFY_SECS_DEFAULT}
    assert mod.NOTIFY_SECS_DEFAULT == 8
    # "secs" never outlasts "expires": a late relay shows only what is left
    _write(path, {"title": "x", "secs": 8, "expires": time.time() + 2.5})
    assert mod.read_notify_msg()["nx"] == 3
    # a runaway "secs" is held to a sane number
    _write(path, {"title": "x", "secs": 10**9, "expires": time.time() + 10**9})
    assert mod.read_notify_msg()["nx"] == mod.NOTIFY_SECS_MAX


@pytest.mark.parametrize("secs", ["5", True, -1, 0, None, [5]])
def test_a_bad_secs_falls_back_to_the_default(relay_files, logs, secs):
    _write(relay_files / "notify.json", {"title": "x", "secs": secs, "expires": time.time() + 30})
    assert mod.read_notify_msg()["nx"] == mod.NOTIFY_SECS_DEFAULT


def test_nan_and_infinity_are_not_numbers_here(relay_files, logs):
    """json.loads takes NaN and Infinity; arithmetic on them must never reach the loop."""
    path = relay_files / "notify.json"
    _write_raw(path, '{"title": "x", "secs": NaN, "expires": %d}' % (time.time() + 30))
    assert mod.read_notify_msg()["nx"] == mod.NOTIFY_SECS_DEFAULT
    for expires in ("NaN", "Infinity", "-Infinity"):
        _write_raw(path, '{"title": "x", "expires": %s}' % expires)
        assert mod.read_notify_msg() == {"nt": "", "nb": ""}


@pytest.mark.parametrize("big", [BIG, "-" + BIG])
def test_an_integer_too_long_for_a_float_is_not_a_number_here(relay_files, logs, big):
    """Past about 309 digits math.isfinite raises OverflowError; neither reader may."""
    notify, page = relay_files / "notify.json", relay_files / "page.json"
    soon = int(time.time()) + 30
    _write_raw(notify, '{"title": "x", "expires": %s}' % big)
    assert mod.read_notify_msg() == {"nt": "", "nb": ""}
    _write_raw(notify, '{"title": "x", "secs": %s, "expires": %d}' % (big, soon))
    assert mod.read_notify_msg()["nx"] == mod.NOTIFY_SECS_DEFAULT
    _write_raw(page, '{"pg": "x", "expires": %s}' % big)
    assert mod.read_page_msg() == ({"pg": ""}, 0.0)
    _write_raw(page, '{"pg": "x", "pp": %s, "expires": %d}' % (big, soon))
    assert mod.read_page_msg()[0]["pp"] == -1


@pytest.mark.parametrize("obj", [
    None,                                                  # no file at all
    {"title": "x", "body": "y", "expires": -1},            # long gone
    {"title": "x", "body": "y"},                           # no expires
    {"title": "x", "body": "y", "expires": "soon"},
    {"title": "", "body": "", "expires": 4102444800},      # nothing to show
    {"title": 7, "body": None, "expires": 4102444800},
    {},
])
def test_absent_expired_or_empty_notification_clears(relay_files, logs, obj):
    if obj is not None:
        _write(relay_files / "notify.json", obj)
    assert mod.read_notify_msg() == {"nt": "", "nb": ""}


@pytest.mark.parametrize("content", ["", "{not json", "[1]", '"text"', "7"])
def test_malformed_notify_file_is_ignored_not_raised(relay_files, logs, content):
    _write_raw(relay_files / "notify.json", content)
    assert mod.read_notify_msg() is None
    assert any("Notify file malformed" in line for line in logs)


# ---------------------------------------------------------------------------
# read_page_msg: file to device message, plus when it lapses
# ---------------------------------------------------------------------------

def test_live_page_becomes_the_seven_fields_and_its_expiry(relay_files, logs):
    expires = time.time() + 30
    _write(relay_files / "page.json", {**PAGE, "expires": expires, "extra": "ignored"})
    assert mod.read_page_msg() == (PAGE, expires)


def test_page_defaults_and_panel_caps(relay_files, logs):
    _write(relay_files / "page.json", {
        "pg": "g" * 20, "pt": "t" * 30, "p1": "a" * 60, "p2": "b" * 60, "p3": "c" * 60,
        "pa": "p" * 30, "expires": time.time() + 30})
    msg, _ = mod.read_page_msg()
    assert msg == {"pg": "g" * 15, "pt": "t" * 23, "p1": "a" * 40, "p2": "b" * 40, "p3": "c" * 40,
                   "pp": -1, "pa": "p" * mod.ANIM_MAX}
    _write(relay_files / "page.json", {"pg": "timer", "expires": time.time() + 30})
    msg, _ = mod.read_page_msg()
    assert msg == {"pg": "timer", "pt": "", "p1": "", "p2": "", "p3": "", "pp": -1, "pa": ""}


@pytest.mark.parametrize("pp, shown", [
    (0, 0), (100, 100), (42.6, 43), (150, 100), (-7, -1), (-1, -1),
    ("50", -1), (True, -1), (None, -1),
])
def test_progress_is_a_whole_percent_or_minus_one(relay_files, logs, pp, shown):
    _write(relay_files / "page.json", {"pg": "x", "pp": pp, "expires": time.time() + 30})
    assert mod.read_page_msg()[0]["pp"] == shown


@pytest.mark.parametrize("obj", [
    None,                                                  # no file at all
    {"pg": "spotify", "expires": -1},                      # long gone
    {"pg": "spotify"},                                     # no expires
    {"pg": "", "expires": 4102444800},                     # an empty page name is no page
    {},
])
def test_absent_expired_or_unnamed_page_clears(relay_files, logs, obj):
    if obj is not None:
        _write(relay_files / "page.json", obj)
    assert mod.read_page_msg() == ({"pg": ""}, 0.0)


@pytest.mark.parametrize("content", ["", "{not json", "[1]", '{"pt": "x", "expires": 4102444800}',
                                     '{"pg": 5, "expires": 4102444800}'])
def test_malformed_page_file_is_ignored_not_raised(relay_files, logs, content):
    _write_raw(relay_files / "page.json", content)
    assert mod.read_page_msg() is None
    assert any("Page file malformed" in line for line in logs)


# ---------------------------------------------------------------------------
# Text as the board keeps it: UTF-8 bytes, whole characters, no control characters
# ---------------------------------------------------------------------------

FOUR = "\U0001D538"   # a character that takes 4 bytes of UTF-8


def test_text_is_capped_in_utf8_bytes_never_inside_a_character(relay_files, logs):
    """The board keeps 23 bytes of a title, not 23 characters: Cyrillic takes 2 bytes a
    letter, so a cap in characters let three times the text onto the wire."""
    _write(relay_files / "page.json", {
        "pg": "ж" * 10, "pt": "Ж" * 30, "p1": "é" * 30, "p2": FOUR * 20, "p3": "a" + "ж" * 30,
        "pa": "й" * 20, "expires": time.time() + 30})
    msg, _ = mod.read_page_msg()
    assert msg == {"pg": "ж" * 7, "pt": "Ж" * 11, "p1": "é" * 20, "p2": FOUR * 10,
                   "p3": "a" + "ж" * 19, "pp": -1, "pa": "й" * 11}
    _write(relay_files / "notify.json", {"title": "Ж" * 30, "body": "ж" * 100, "expires": time.time() + 30})
    assert mod.read_notify_msg() == {"nt": "Ж" * 11, "nb": "ж" * 48, "nx": 8}


def test_control_characters_become_spaces_and_a_newline_stays(relay_files, logs):
    """What the board shows anyway, at 1 byte on the wire instead of a 6 byte escape."""
    _write(relay_files / "notify.json",
           {"title": "a\tb\x00c", "body": "one\ntwo\rthree\x1b", "expires": time.time() + 30})
    assert mod.read_notify_msg() == {"nt": "a b c", "nb": "one\ntwo three ", "nx": 8}


def test_a_lone_surrogate_becomes_a_question_mark(relay_files, logs):
    """json.loads lets "\\ud800" through; UTF-8 has no such character."""
    _write_raw(relay_files / "page.json",
               '{"pg": "x", "p1": "a\\ud800b", "expires": %d}' % (time.time() + 30))
    assert mod.read_page_msg()[0]["p1"] == "a?b"


# ---------------------------------------------------------------------------
# connect_and_run: each goes to the board as its own message, at once
# ---------------------------------------------------------------------------

def test_notification_goes_out_at_once_as_its_own_message(relay_files, logs, fast):
    notify = relay_files / "notify.json"
    sent, _, write = _recorder()

    async def scenario(stop_event):
        await until(lambda: sent == [USAGE])
        _write(notify, {"title": "Build done", "body": "all green", "secs": 6, "expires": time.time() + 30})
        await until(lambda: len(sent) == 2)
        notify.unlink()                                    # the engine takes it back
        await until(lambda: len(sent) == 3)

    _drive(write, scenario)
    assert sent == [USAGE, {"nt": "Build done", "nb": "all green", "nx": 6}, {"nt": "", "nb": ""}]


def test_a_notification_from_before_the_link_is_not_shown(relay_files, logs, fast):
    _write(relay_files / "notify.json", {"title": "old", "body": "news", "expires": time.time() + 30})
    sent, _, write = _recorder()

    async def scenario(stop_event):
        await asyncio.sleep(0.3)                           # plenty of ticks

    _drive(write, scenario)
    assert sent == [USAGE]


def test_page_goes_out_on_connect_then_only_when_it_changes(relay_files, logs, fast):
    page = relay_files / "page.json"
    _write(page, {**PAGE, "expires": time.time() + 30})    # already there when the board links
    sent, _, write = _recorder()

    async def scenario(stop_event):
        await until(lambda: len(sent) == 2)
        assert sent == [PAGE, USAGE]                       # a linking board gets the current page first
        _write(page, {**PAGE, "expires": time.time() + 60})              # kept alive: nothing new
        await asyncio.sleep(0.2)
        assert len(sent) == 2
        _write(page, {**PAGE, "pp": 11, "expires": time.time() + 60})   # the bar moves
        await until(lambda: len(sent) == 3)
        _write(page, {**PAGE, "p1": "Next song", "pp": 0, "expires": time.time() + 60})
        await until(lambda: len(sent) == 4)
        page.unlink()
        await until(lambda: len(sent) == 5)

    _drive(write, scenario)
    assert sent[2:] == [{**PAGE, "pp": 11}, {**PAGE, "p1": "Next song", "pp": 0}, {"pg": ""}]
    # the move of the bar went out without a log line; everything else is logged as usual
    assert sum(line.startswith("Sending:") for line in logs) == 4
    assert sum("Page file changed" in line for line in logs) == 3


def test_an_absent_page_sends_nothing_on_connect(relay_files, logs, fast):
    sent, _, write = _recorder()

    async def scenario(stop_event):
        await asyncio.sleep(0.3)

    _drive(write, scenario)
    assert sent == [USAGE]


def test_the_daemon_clears_a_page_once_it_lapses(relay_files, logs, fast):
    """The page message has no timer, so a page whose writer went quiet must not stick."""
    page = relay_files / "page.json"
    _write(page, {**PAGE, "expires": time.time() + 1.0})
    sent, _, write = _recorder()

    async def scenario(stop_event):
        await until(lambda: {"pg": ""} in sent)

    _drive(write, scenario)
    assert sent == [PAGE, USAGE, {"pg": ""}]
    assert page.exists()                                   # nobody touched the file: the daemon's own timer
    assert any("Page expired" in line for line in logs)


def test_a_malformed_rewrite_keeps_the_page_until_it_lapses(relay_files, logs, fast):
    page = relay_files / "page.json"
    _write(page, {**PAGE, "expires": time.time() + 1.5})
    sent, _, write = _recorder()

    async def scenario(stop_event):
        await until(lambda: len(sent) >= 2)
        _write_raw(page, "{oops")
        await asyncio.sleep(0.1)
        assert sent == [PAGE, USAGE]                       # nothing sent for a bad file
        await until(lambda: {"pg": ""} in sent)            # the last good page still lapses on time

    _drive(write, scenario)
    assert any("Page file malformed" in line for line in logs)


def test_a_huge_number_in_page_json_never_takes_the_link_down(relay_files, logs, fast):
    """page.json is read again on every link, so a crash here would repeat on every restart."""
    _write_raw(relay_files / "page.json", '{"pg": "x", "pp": %s, "expires": %d}' % (BIG, time.time() + 30))
    sent, _, write = _recorder()

    async def scenario(stop_event):
        await until(lambda: len(sent) == 2)

    _drive(write, scenario)
    assert sent == [{"pg": "x", "pt": "", "p1": "", "p2": "", "p3": "", "pp": -1, "pa": ""}, USAGE]


# ---------------------------------------------------------------------------
# A page left on a board: the record of which boards were sent one
# ---------------------------------------------------------------------------

def _record(base):
    return json.loads((base / "daemon.pages").read_text(encoding="utf-8"))["boards"]


def _link(write, scenario):
    """One link to the board at BOARD, like a real one: the board has an address."""
    _drive(write, scenario, device=MagicMock(address=BOARD))


def _link_with_a_page(relay_files):
    """Link once while page.json holds PAGE; returns what the board got."""
    _write(relay_files / "page.json", {**PAGE, "expires": time.time() + 60})
    sent, _, write = _recorder()

    async def scenario(stop_event):
        await until(lambda: len(sent) == 2)

    _link(write, scenario)
    assert sent == [PAGE, USAGE]
    return sent


def _link_again(relay_files):
    """Link once more and let a few ticks pass; returns what the board got."""
    sent, _, write = _recorder()

    async def scenario(stop_event):
        await until(lambda: USAGE in sent)
        await asyncio.sleep(0.1)

    _link(write, scenario)
    return sent


def test_a_board_shown_a_page_is_told_to_drop_it_when_it_links_without_one(relay_files, logs, fast):
    """The engine clears a page by removing page.json. If it did that while the board was
    away (PC asleep, tray restarted), the board still shows the page when it links again
    and keeps it for good (the host writes often enough that the board never times it out)."""
    _link_with_a_page(relay_files)
    assert _record(relay_files) == [BOARD]
    (relay_files / "page.json").unlink()                   # dropped while the board was away
    assert _link_again(relay_files) == [{"pg": ""}, USAGE]
    assert _record(relay_files) == []
    assert _link_again(relay_files) == [USAGE]             # told once; nothing more after that


def test_the_record_outlives_the_tray(relay_files, logs, fast, monkeypatch):
    _link_with_a_page(relay_files)
    (relay_files / "page.json").unlink()
    monkeypatch.setattr(mod, "_PAGED", None)                # a new tray process reads the file again
    assert _link_again(relay_files) == [{"pg": ""}, USAGE]


def test_a_page_that_lapsed_while_the_board_was_away_is_cleared_on_link(relay_files, logs, fast):
    _link_with_a_page(relay_files)
    _write(relay_files / "page.json", {**PAGE, "expires": time.time() - 1})
    assert _link_again(relay_files) == [{"pg": ""}, USAGE]


def test_a_board_that_still_has_its_page_gets_it_again(relay_files, logs, fast):
    """It may have left the page by itself meanwhile (a tap, a reboot)."""
    _link_with_a_page(relay_files)
    assert _link_again(relay_files) == [PAGE, USAGE]
    assert _record(relay_files) == [BOARD]


def test_only_a_board_the_daemon_sent_a_page_is_sent_a_clear(relay_files, logs, fast):
    """A board on old firmware takes any message for usage, so a board never sent a page
    is never sent a clear either: with no page.json the wire carries usage alone."""
    _write(relay_files / "daemon.pages", {"boards": ["D4:05:92:B7:8B:E2"]})   # another board
    assert _link_again(relay_files) == [USAGE]
    _write(relay_files / "page.json", {**PAGE, "expires": time.time() - 1})   # lapsed, on disk
    assert _link_again(relay_files) == [USAGE]


def test_the_page_expiry_clears_the_record_too(relay_files, logs, fast):
    _write(relay_files / "page.json", {**PAGE, "expires": time.time() + 0.5})
    sent, _, write = _recorder()

    async def scenario(stop_event):
        await until(lambda: {"pg": ""} in sent)

    _link(write, scenario)
    assert _record(relay_files) == []


@pytest.mark.parametrize("content", ["{oops", "[1]", '{"boards": "E8:3D:C1:F7:6F:21"}', ""])
def test_an_unreadable_record_counts_as_empty(relay_files, logs, fast, content):
    _write_raw(relay_files / "daemon.pages", content)
    assert _link_again(relay_files) == [USAGE]
    _link_with_a_page(relay_files)                          # and it is written whole again
    assert _record(relay_files) == [BOARD]


def test_a_record_write_failure_is_logged_not_raised(relay_files, logs, fast):
    relay_files.mkdir(parents=True, exist_ok=True)
    (relay_files / "daemon.pages").mkdir()                 # a folder where the file should be
    _link_with_a_page(relay_files)
    assert any("Page record" in line for line in logs)


def test_a_same_tick_burst_is_spaced_out(relay_files, logs, monkeypatch):
    """The board holds one incoming message at a time: back to back writes must not collide."""
    monkeypatch.setattr(mod, "TICK", 0.01)
    monkeypatch.setattr(mod, "WATCH_TICK", 0.01)
    monkeypatch.setattr(mod, "WRITE_GAP", 0.2)
    sent, times, write = _recorder()

    async def scenario(stop_event):
        await until(lambda: len(sent) == 1)
        # both land between two ticks, so one tick sends both
        _write(relay_files / "notify.json", {"title": "Now playing", "expires": time.time() + 30})
        _write(relay_files / "page.json", {**PAGE, "expires": time.time() + 30})
        await until(lambda: len(sent) == 3)

    _drive(write, scenario)
    assert [next(iter(m)) for m in sent] == ["s", "nt", "pg"]
    assert times[2] - times[1] >= 0.2 - CLOCK_SLACK


# ---------------------------------------------------------------------------
# Session: write pacing and quiet writes
# ---------------------------------------------------------------------------

def test_writes_keep_the_gap_but_the_first_one_waits_for_nothing(monkeypatch, logs):
    monkeypatch.setattr(mod, "WRITE_GAP", 0.2)
    times = []

    async def write(_uuid, _data, response=False):
        times.append(time.monotonic())

    client = MagicMock()
    client.write_gatt_char = write
    session = mod.Session(client)

    async def burst():
        t0 = time.monotonic()
        for i in range(3):
            assert await session.write_payload({"i": i}, quiet=i == 2)
        return t0

    t0 = asyncio.run(burst())
    assert times[0] - t0 < 0.1
    assert times[1] - times[0] >= 0.2 - CLOCK_SLACK and times[2] - times[1] >= 0.2 - CLOCK_SLACK
    assert logs == ['Sending: {"i":0}', 'Sending: {"i":1}']   # the quiet write logged nothing


# ---------------------------------------------------------------------------
# Session: what goes on the wire, and how much of it the link takes
# ---------------------------------------------------------------------------

def _session(mtu=None):
    """A Session on a fake client that keeps the bytes it is given. mtu=None leaves
    client.mtu_size a MagicMock attribute, which is not a number."""
    sent = []

    async def write(_uuid, data, response=False):
        sent.append(bytes(data))

    client = MagicMock()
    client.write_gatt_char = write
    if mtu is not None:
        client.mtu_size = mtu
    return mod.Session(client), sent


class _GoneClient:
    """bleak's WinRT client once the link is gone: mtu_size asserts a live session."""

    @property
    def mtu_size(self):
        raise AssertionError


@pytest.mark.parametrize("mtu, limit", [
    (256, 253),                          # what the boards ask for
    (185, 182),
    (517, 511),                          # the largest MTU, held to what the board keeps
    (23, mod.WIRE_MAX_ASSUMED),          # the ATT default: no exchange yet
    (True, mod.WIRE_MAX_ASSUMED),
    ("256", mod.WIRE_MAX_ASSUMED),
    (None, mod.WIRE_MAX_ASSUMED),        # a MagicMock attribute
], ids=["256", "185", "517", "23", "bool", "text", "mock"])
def test_the_write_limit_follows_the_link(mtu, limit):
    session, _ = _session(mtu)
    assert session.write_limit() == limit
    assert mod.WIRE_MAX_ASSUMED == 253


def test_a_client_without_a_session_gets_the_assumed_limit():
    assert mod.Session(_GoneClient()).write_limit() == mod.WIRE_MAX_ASSUMED


def test_text_goes_out_as_raw_utf8_not_as_escapes(logs):
    session, sent = _session(256)
    assert asyncio.run(session.write_payload({"nt": "Группа крови", "nb": "", "nx": 8}))
    assert sent == ['{"nt":"Группа крови","nb":"","nx":8}'.encode("utf-8")]
    assert logs == ['Sending: {"nt":"Группа крови","nb":"","nx":8}']


def test_a_lone_surrogate_in_any_message_never_raises(logs):
    """approve.json and state.json can carry one too; they do not pass through _text."""
    session, sent = _session(256)
    assert asyncio.run(session.write_payload({"q": "abc123", "qt": "Bash", "qs": "x\ud800y", "qx": 30}))
    assert json.loads(sent[0])["qs"] == "x?y"


def test_a_page_too_long_for_the_link_gives_up_the_end_of_p3_first(logs):
    """Quotes and backslashes are escaped, so a page inside every cap can still be too long."""
    page = {"pg": "spotify", "pt": 'Kino "Live"', "p1": '"' * 40, "p2": "\\" * 40,
            "p3": "Desk speaker in the living room", "pp": 42, "pa": "echo headphones"}
    assert len(mod._encode(page)) > 253
    session, sent = _session(256)
    assert asyncio.run(session.write_payload(page))
    got = json.loads(sent[0])
    assert len(sent[0]) == 253                              # cut no further than it had to be
    assert {k: v for k, v in got.items() if k != "p3"} == {k: v for k, v in page.items() if k != "p3"}
    assert got["p3"] and page["p3"].startswith(got["p3"])
    assert any("cut to 253" in line for line in logs)


def test_a_smaller_link_cuts_deeper_in_order(logs):
    page = {"pg": "spotify", "pt": "Now playing", "p1": "a" * 40, "p2": "b" * 40, "p3": "c" * 40,
            "pp": 42, "pa": "echo headphones"}
    bare = len(mod._encode({**page, "p1": "", "p2": "", "p3": ""}))
    session, sent = _session(100)                           # 97 bytes a message
    assert asyncio.run(session.write_payload(page))
    got = json.loads(sent[0])
    assert len(sent[0]) == 97
    assert (got["pt"], got["p1"], got["p2"], got["p3"]) == ("Now playing", "a" * (97 - bare), "", "")


def test_a_notification_gives_up_its_body_first_and_a_prompt_its_text(logs, monkeypatch):
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)
    session, sent = _session(60)                            # 57 bytes a message
    assert asyncio.run(session.write_payload({"nt": "Build finished", "nb": "all green " * 9, "nx": 8}))
    assert json.loads(sent[0]) == {"nt": "Build finished", "nb": ("all green " * 9)[:19], "nx": 8}
    assert asyncio.run(session.write_payload({"q": "abc123", "qt": "Bash", "qs": "git push " * 10, "qx": 30}))
    assert json.loads(sent[1]) == {"q": "abc123", "qt": "Bash", "qs": ("git push " * 10)[:15], "qx": 30}
    assert all(len(data) == 57 for data in sent)


def test_a_usage_payload_is_never_cut_or_dropped(logs):
    """Only a relay message has text to give up; a dropped usage write would count as a
    dead link and reconnect for nothing."""
    usage = {"s": 10, "sr": 100, "w": 5, "wr": 1000, "st": "allowed", "acct": "pro", "ok": True}
    session, sent = _session(40)
    assert asyncio.run(session.write_payload(usage))
    assert json.loads(sent[0]) == usage and len(sent[0]) > 37


def test_a_message_that_cannot_fit_is_not_sent(logs):
    session, sent = _session(40)                            # 37 bytes: less than PAGE's name and creature
    assert asyncio.run(session.write_payload(dict(PAGE))) is False
    assert sent == []
    assert sum("does not fit the link" in line for line in logs) == 1


def test_a_quiet_cut_logs_nothing(logs, monkeypatch):
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)
    session, sent = _session(100)
    long_page = {**PAGE, "p1": "x" * 40, "p2": "y" * 40, "p3": "z" * 40}
    assert asyncio.run(session.write_payload(long_page, quiet=True))
    assert logs == [] and len(sent[0]) <= 97


def test_a_cyrillic_page_now_reaches_the_board_whole(relay_files, logs, fast):
    """End to end, a card for a Russian track from a writer that does not fold its text to
    ASCII (the engine does): every field full to its byte cap, with quotes. As \\u escapes
    it came to over 400 bytes, which no write on this link can carry; as raw UTF-8 it
    fits with room to spare, nothing cut."""
    _write(relay_files / "page.json", {
        "pg": "spotify", "pt": "Сейчас играет", "p1": '"Группа крови" (Remastered 2019)',
        "p2": '"Кино", Виктор Цой', "p3": "Колонка на столе в гостиной", "pp": 42,
        "pa": "echo headphones", "expires": time.time() + 30})
    sent = []

    async def write(_uuid, data, response=False):
        sent.append(bytes(data))

    async def scenario(stop_event):
        await until(lambda: len(sent) == 2)

    _drive(write, scenario)
    msg, _ = mod.read_page_msg()
    assert json.loads(sent[0]) == msg                       # arrived as read, nothing cut
    assert len(sent[0]) <= mod.WIRE_MAX_ASSUMED
    assert len(json.dumps(msg, separators=(",", ":")).encode()) > 400     # the old escaped form
    assert not any("cut to" in line for line in logs)


# ---------------------------------------------------------------------------
# Session._on_tx: a button press becomes events/<ns>.json for the engine
# ---------------------------------------------------------------------------

def _events(base):
    folder = base / "events"
    return sorted(folder.iterdir(), key=lambda p: int(p.stem)) if folder.exists() else []


def test_button_press_lands_in_events(relay_files, logs):
    s = mod.Session(MagicMock(), "E8:3D:C1:F7:6F:21")
    s._on_tx(None, bytearray(b'{"btn":"aux","scr":"page"}'))
    files = _events(relay_files)
    assert len(files) == 1 and files[0].suffix == ".json" and files[0].stem.isdigit()
    event = json.loads(files[0].read_text(encoding="utf-8"))
    assert set(event) == {"btn", "scr", "addr", "ts"}
    assert (event["btn"], event["scr"], event["addr"]) == ("aux", "page", "E8:3D:C1:F7:6F:21")
    assert abs(event["ts"] - time.time()) < 5
    assert not (relay_files / "decisions").exists()


def test_quick_presses_get_names_that_only_grow(relay_files, logs, monkeypatch):
    """Two presses inside one clock step must not share a file, and order must survive."""
    monkeypatch.setattr(mod.time, "time_ns", lambda: 1_000)
    s = mod.Session(MagicMock(), "E8:3D:C1:F7:6F:21")
    for btn in ("pwr", "aux", "pwr"):
        s._on_tx(None, bytearray(json.dumps({"btn": btn, "scr": "usage"}).encode()))
    files = _events(relay_files)
    stems = [int(p.stem) for p in files]
    assert len(stems) == 3 and stems == sorted(set(stems))
    assert [json.loads(p.read_text(encoding="utf-8"))["btn"] for p in files] == ["pwr", "aux", "pwr"]


def test_a_bad_screen_name_still_records_the_press(relay_files, logs):
    s = mod.Session(MagicMock(), "E8:3D:C1:F7:6F:21")
    s._on_tx(None, bytearray(b'{"btn":"pwr","scr":"../../x"}'))
    s._on_tx(None, bytearray(b'{"btn":"pwr"}'))
    assert [json.loads(p.read_text(encoding="utf-8"))["scr"] for p in _events(relay_files)] == ["", ""]


@pytest.mark.parametrize("data", [
    b'{"btn":""}', b'{"btn":7}', b'{"btn":null}', b'{"btn":"../x"}', b'{"btn":"a b"}',
    b'{"btn":"' + b"x" * 16 + b'"}',
    b'{"ack":true}', b'{"err":true}', b'{"future":"thing"}', b'not json', b'[1,2]',
])
def test_other_tx_notifies_write_no_event(relay_files, logs, data):
    s = mod.Session(MagicMock(), "E8:3D:C1:F7:6F:21")
    s._on_tx(None, bytearray(data))
    assert _events(relay_files) == []
    assert not (relay_files / "decisions").exists()


def test_a_button_press_is_read_before_an_approve_answer(relay_files, logs):
    s = mod.Session(MagicMock(), "E8:3D:C1:F7:6F:21")
    s._on_tx(None, bytearray(b'{"btn":"pwr","scr":"approve","approve":"abc123"}'))
    assert len(_events(relay_files)) == 1
    assert not (relay_files / "decisions").exists()


def test_an_event_write_failure_is_logged_not_raised(relay_files, logs):
    relay_files.mkdir(parents=True, exist_ok=True)
    (relay_files / "events").write_text("a file where the folder should be", encoding="utf-8")
    s = mod.Session(MagicMock(), "E8:3D:C1:F7:6F:21")
    s._on_tx(None, bytearray(b'{"btn":"pwr","scr":"usage"}'))
    assert any("Event write failed" in line for line in logs)
