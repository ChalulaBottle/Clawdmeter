#!/usr/bin/env python3
"""Album art over the link (plans/labdaemon.md, Increment 2b): art/<pi>.jpg streamed to each board.

conftest points ART_DIR and every relay file at tmp_path; the live %LOCALAPPDATA%\\Clawdmeter
is never touched. A board here is a fake BleakClient with a real bleak service table: it keeps
every write with its characteristic, puts a header and its chunks together the way the firmware
is meant to, and answers on TX when a whole picture is in or when the test says so.

Run: python -m pytest daemon/tests/test_windows_art.py -x -q
"""
import asyncio
import json
import random
import re
import time
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest
from bleak.backends.characteristic import BleakGATTCharacteristic
from bleak.backends.service import BleakGATTService, BleakGATTServiceCollection

import daemon.claude_usage_daemon_windows as mod

USAGE = {"s": 10, "ok": True}
PAGE = {"pg": "spotify", "pt": "Now playing", "p1": "Song", "p2": "Artist",
        "p3": "Desk speaker", "pp": 10, "pa": "echo headphones"}
ART = "0123456789ab"          # the engine's shape: the first 12 hex of a sha1
ART_B = "fedcba987654"
ART_C = "00aa11bb22cc"
FIVE_KB = 5 * 1024
BOARD = "E8:3D:C1:F7:6F:21"
BOARD_B = "D4:05:92:B7:8B:E2"
# asyncio on Windows fires a timer up to one clock step (15.6 ms) early, and
# time.monotonic() moves in the same steps, so a measured gap comes out a little short.
CLOCK_SLACK = 0.04
NO_CHARACTERISTIC = "Board has no album art characteristic (older firmware), no art on this link"
ART_LINE = re.compile(r"(\[[^\]]+\] )?Art [a-z0-9]+[ :]")


@pytest.fixture
def logs(monkeypatch):
    lines = []
    monkeypatch.setattr(mod, "log", lines.append)
    return lines


@pytest.fixture
def tagged_logs(monkeypatch):
    """Log lines as the file log gets them, board tag included."""
    lines = []
    monkeypatch.setattr(mod, "log", lambda msg: lines.append(mod._LOG_TAG.get() + msg))
    return lines


@pytest.fixture
def fast(monkeypatch):
    """Tick quickly and space neither messages nor chunks (the pace has tests of its own)."""
    monkeypatch.setattr(mod, "TICK", 0.01)
    monkeypatch.setattr(mod, "WATCH_TICK", 0.01)
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)
    monkeypatch.setattr(mod, "ART_CHUNK_GAP", 0.0)


def _art_lines(lines):
    """The one line each picture gets in the log."""
    return [line for line in lines if ART_LINE.match(line)]


def _table(art=True):
    """The board's GATT table as bleak keeps it after service discovery; older firmware has
    no art characteristic."""
    table = BleakGATTServiceCollection()
    service = BleakGATTService(None, 1, mod.SERVICE_UUID)
    table.add_service(service)
    uuids = [mod.RX_CHAR_UUID, mod.TX_CHAR_UUID, mod.REQ_CHAR_UUID] + ([mod.ART_CHAR_UUID] if art else [])
    for handle, uuid in enumerate(uuids, start=2):
        table.add_characteristic(BleakGATTCharacteristic(
            None, handle, uuid, ["write-without-response", "notify"], lambda: 253, service))
    return table


class Board:
    """A board behind a fake BleakClient.

    Every write is kept in order as (characteristic, bytes, response flag, time). A header
    starts a picture and the chunks fill it in by number; once every chunk is in and the
    length is right the picture counts as shown and, with auto_ok, the board answers
    {"art": id, "ok": 1} on TX. Chunk numbers in `drop` are lost the first time they come;
    the test answers "miss" for them, as the board's own timer would.
    """

    def __init__(self, mtu=256, art=True, auto_ok=True, drop=()):
        self.writes = []
        self.tx = None
        self.auto_ok = auto_ok
        self.drop = set(drop)
        self.fail_chunk = None            # a chunk number whose write raises, every time
        self.picture = None               # (header, chunks so far) of the picture being put together
        self.shown = []                   # (id, bytes) of every picture put together whole
        self.writes_at_disconnect = None
        self.client = MagicMock()
        self.client.is_connected = True
        self.client.mtu_size = mtu
        self.client.services = _table(art)
        self.client.connect = AsyncMock()
        self.client.disconnect = AsyncMock(side_effect=self._disconnect)
        self.client.start_notify = AsyncMock(side_effect=self._subscribe)
        self.client.write_gatt_char = self._write

    def _subscribe(self, uuid, callback):
        if uuid == mod.TX_CHAR_UUID:
            self.tx = callback

    def _disconnect(self):
        self.writes_at_disconnect = len(self.writes)

    async def _write(self, uuid, data, response=None):
        data = bytes(data)
        if uuid == mod.ART_CHAR_UUID and int.from_bytes(data[:2], "little") == self.fail_chunk:
            raise mod.BleakError("Unreachable")
        self.writes.append((uuid, data, response, time.monotonic()))
        if uuid == mod.RX_CHAR_UUID:
            msg = json.loads(data)
            if "ab" in msg:
                self.picture = (msg, {})
        elif uuid == mod.ART_CHAR_UUID and self.picture is not None:
            header, parts = self.picture
            k = int.from_bytes(data[:2], "little")
            if k in self.drop:
                self.drop.discard(k)
                return
            parts[k] = data[2:]
            if all(i in parts for i in range(header["an"])):
                whole = b"".join(parts[i] for i in range(header["an"]))
                if len(whole) == header["al"]:
                    self.picture = None
                    self.shown.append((header["ab"], whole))
                    if self.auto_ok:
                        asyncio.get_running_loop().call_soon(self.answer, {"art": header["ab"], "ok": 1})

    def answer(self, msg):
        self.tx(None, bytearray(json.dumps(msg).encode()))

    def messages(self):
        return [json.loads(d) for u, d, _, _ in self.writes if u == mod.RX_CHAR_UUID]

    def headers(self):
        return [m for m in self.messages() if "ab" in m]

    def chunks(self):
        return [(int.from_bytes(d[:2], "little"), d[2:]) for u, d, _, _ in self.writes
                if u == mod.ART_CHAR_UUID]

    def numbers(self):
        return [k for k, _ in self.chunks()]

    def at(self, test):
        """The place in `writes` of the first write that `test(uuid, data)` is true for."""
        return next(i for i, (u, d, _, _) in enumerate(self.writes) if test(u, d))

    def when(self, test):
        return self.writes[self.at(test)][3]


def _is_page(art_id):
    return lambda u, d: u == mod.RX_CHAR_UUID and b'"pg"' in d and f'"pi":"{art_id}"'.encode() in d


def _is_header(art_id):
    return lambda u, d: u == mod.RX_CHAR_UUID and f'"ab":"{art_id}"'.encode() in d


def _is_chunk(u, _d):
    return u == mod.ART_CHAR_UUID


def _picture(base, art_id, size, seed=1):
    """art/<id>.jpg the way the engine leaves it; any bytes do, the board here only counts them."""
    data = random.Random(seed).randbytes(size)
    folder = base / "art"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{art_id}.jpg").write_bytes(data)
    return data


def _page(base, **fields):
    """page.json the way the engine writes it: whole, by atomic replace."""
    mod._write_json_atomic(base / "page.json", {**PAGE, **fields, "expires": time.time() + 60})


async def until(cond, timeout=5.0):
    deadline = time.monotonic() + timeout
    while not cond():
        if time.monotonic() > deadline:
            raise AssertionError("timed out waiting for the daemon")
        await asyncio.sleep(0.01)


def _drive(boards, scenario, timeout=20, linger=0.0):
    """Link every board in `boards` (address: Board) while `scenario()` acts on the files and
    the boards. One board gets the single link of connect_and_run; several get one
    _board_link each, as main() gives them, so every link carries its board's log tag.
    `linger` keeps the loop running that long after the links ended (asyncio.run would
    otherwise cancel whatever a link left behind)."""
    async def run():
        stop_event = asyncio.Event()
        if len(boards) == 1:
            links = [asyncio.ensure_future(mod.connect_and_run(MagicMock(address=a), stop_event))
                     for a in boards]
        else:
            turn = asyncio.Lock()
            links = [asyncio.ensure_future(mod._board_link(a, stop_event, None, turn)) for a in boards]
        try:
            await scenario()
        finally:
            stop_event.set()
            await asyncio.gather(*links)
        await asyncio.sleep(linger)

    with patch.object(mod, "BleakClient", side_effect=lambda device, **kw: boards[device.address].client), \
         patch.object(mod, "read_token", return_value="tok"), \
         patch.object(mod, "poll_api", new=AsyncMock(side_effect=lambda _tok: dict(USAGE))):
        asyncio.run(asyncio.wait_for(run(), timeout=timeout))


def _session_run(board, scenario, timeout=10):
    """A Session on `board` with no tick loop around it: the test calls page_art itself, so
    the order of ids is exact."""
    async def run():
        session = mod.Session(board.client, BOARD)
        await session.setup_tx_subscription()
        try:
            await scenario(session)
        finally:
            await session.stop_art()

    asyncio.run(asyncio.wait_for(run(), timeout=timeout))


# ---------------------------------------------------------------------------
# The contract
# ---------------------------------------------------------------------------

def test_the_protocol_constants():
    assert mod.ART_CHAR_UUID == "4c41555a-4465-7669-6365-000000000005"
    assert mod.ART_CHUNK_GAP == 0.008          # the default pace between two chunk writes
    assert mod.ART_ANSWER_WAIT == 4.0          # the board's 3 s timer, and a second for where it counts from
    assert mod.ART_RESEND_ROUNDS == 3
    assert mod.ART_FILE_MAX == 24 * 1024
    assert mod.ART_CHUNK_MAX == 512            # an attribute value never holds more (ATT)


# ---------------------------------------------------------------------------
# A picture on the wire: the header, then every chunk
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("mtu, payload, count", [(256, 251, 21), (185, 180, 29), (515, 510, 11), (517, 510, 11)],
                         ids=["mtu 256", "mtu 185", "mtu 515", "mtu 517"])
def test_a_5_kb_picture_goes_as_its_header_then_every_chunk(relay_files, logs, fast, mtu, payload, count):
    """A chunk is its number in 2 bytes little endian, then the next MTU less 5 bytes of the file;
    the last carries what is left. A chunk write is held to the 512 bytes an attribute value
    holds, so past an MTU of 515 the part stays 510 bytes; the board's 511 byte message buffer
    plays no part."""
    data = _picture(relay_files, ART, FIVE_KB)
    _page(relay_files, pi=ART)
    board = Board(mtu=mtu)

    async def scenario():
        await until(lambda: _art_lines(logs))

    _drive({BOARD: board}, scenario)
    # the page first and unchanged, then the header on the message characteristic, then the chunks
    assert board.messages()[0] == {**PAGE, "pi": ART}
    assert board.headers() == [{"ab": ART, "al": FIVE_KB, "an": count}]
    assert board.at(_is_page(ART)) < board.at(_is_header(ART)) < board.at(_is_chunk)
    chunk_writes = [(d, r) for u, d, r, _ in board.writes if u == mod.ART_CHAR_UUID]
    assert all(r is False for _, r in chunk_writes)                     # write without response
    assert [d[:2] for d, _ in chunk_writes] == [k.to_bytes(2, "little") for k in range(count)]
    last = FIVE_KB - payload * (count - 1)
    assert [len(d) for d, _ in chunk_writes] == [payload + 2] * (count - 1) + [last + 2]
    assert all(len(d) <= min(mtu - 3, 512) for d, _ in chunk_writes)    # each fits the link
    assert b"".join(part for _, part in board.chunks()) == data
    assert board.shown == [(ART, data)]
    # one line for the picture: its id, bytes, chunks, the writes and the time it took
    lines = _art_lines(logs)
    assert len(lines) == 1
    assert re.fullmatch(rf"Art {ART} shown: {FIVE_KB} bytes in {count} chunks, {count} writes, \d+ ms", lines[0])
    assert not any(line.startswith("Sending:") and '"ab"' in line for line in logs)   # the header is quiet


class _GoneClient:
    """bleak's WinRT client once the link is gone: mtu_size asserts a live session."""

    @property
    def mtu_size(self):
        raise AssertionError


@pytest.mark.parametrize("mtu, size", [
    (256, 251),                          # what the boards ask for
    (185, 180),
    (514, 509),
    (515, 510),                          # a 512 byte write: the most an attribute value holds
    (517, 510),                          # the largest MTU, held to that 512
    (23, 251),                           # the ATT default, no exchange yet: what the boards ask for
    (True, 251),
    ("256", 251),
], ids=["256", "185", "514", "515", "517", "23", "bool", "text"])
def test_a_chunk_carries_the_mtu_less_5_and_at_most_510(mtu, size):
    """The board's 511 byte message buffer plays no part: a chunk lands in its picture buffer."""
    client = MagicMock()
    client.mtu_size = mtu
    session = mod.Session(client, BOARD)
    assert session.art_chunk_size() == size
    assert session.art_chunk_size() + 2 <= mod.ART_CHUNK_MAX
    assert mod.Session(_GoneClient(), BOARD).art_chunk_size() == 251


def test_chunk_numbers_past_255_are_little_endian(relay_files, logs, monkeypatch):
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)
    monkeypatch.setattr(mod, "ART_CHUNK_GAP", 0.0)
    data = _picture(relay_files, ART, 24 * 1024)
    board = Board(mtu=100)                    # 97 bytes a write: 95 of the picture in each of 259 chunks

    async def scenario(session):
        session.page_art(ART)
        await until(lambda: _art_lines(logs))

    _session_run(board, scenario)
    assert board.headers() == [{"ab": ART, "al": 24 * 1024, "an": 259}]
    assert board.numbers() == list(range(259))
    raw = [d for u, d, _, _ in board.writes if u == mod.ART_CHAR_UUID]
    assert raw[256][:2] == b"\x00\x01" and raw[258][:2] == b"\x02\x01"
    assert board.shown == [(ART, data)]


def test_chunks_are_paced_and_other_messages_go_in_between(relay_files, logs, fast, monkeypatch):
    """An await between two chunk writes: the tick loop's messages are never held up by a picture."""
    monkeypatch.setattr(mod, "ART_CHUNK_GAP", 0.2)
    _picture(relay_files, ART, 4 * 251)                     # 4 chunks
    _page(relay_files, pi=ART)
    board = Board()

    async def scenario():
        await until(lambda: len(board.chunks()) == 1)
        mod._write_json_atomic(relay_files / "notify.json", {"title": "Build done", "expires": time.time() + 30})
        await until(lambda: _art_lines(logs))

    _drive({BOARD: board}, scenario)
    stamps = [t for u, _, _, t in board.writes if u == mod.ART_CHAR_UUID]
    assert len(stamps) == 4
    assert all(b - a >= 0.2 - CLOCK_SLACK for a, b in zip(stamps, stamps[1:]))
    chunk_places = [i for i, (u, _, _, _) in enumerate(board.writes) if u == mod.ART_CHAR_UUID]
    notify_at = board.at(lambda u, d: u == mod.RX_CHAR_UUID and b'"nt"' in d)
    assert chunk_places[0] < notify_at < chunk_places[-1]


def test_the_header_keeps_the_message_gap_and_chunk_0_waits_for_it(relay_files, logs, fast, monkeypatch):
    """The header is a message like the page before it, so it keeps WRITE_GAP from it; the
    board reads it in its loop, so chunk 0 waits the same gap after the header."""
    monkeypatch.setattr(mod, "WRITE_GAP", 0.2)
    _picture(relay_files, ART, 1000)
    _page(relay_files, pi=ART)
    board = Board()

    async def scenario():
        await until(lambda: _art_lines(logs), timeout=8)

    _drive({BOARD: board}, scenario)
    page, header, chunk = board.when(_is_page(ART)), board.when(_is_header(ART)), board.when(_is_chunk)
    assert header - page >= 0.2 - CLOCK_SLACK
    assert chunk - header >= 0.2 - CLOCK_SLACK


# ---------------------------------------------------------------------------
# The board's answer: ok ends it, miss resends, silence gives up
# ---------------------------------------------------------------------------

def test_ok_ends_it_and_the_same_id_never_goes_again(relay_files, logs, fast):
    _picture(relay_files, ART, FIVE_KB)
    _page(relay_files, pi=ART)
    board = Board()

    async def scenario():
        await until(lambda: _art_lines(logs))
        _page(relay_files, pi=ART, pp=11)                    # the bar moves: the same picture
        await until(lambda: any(m.get("pp") == 11 for m in board.messages()))
        board.answer({"art": ART, "ok": 1})                  # late answers for it are dropped
        board.answer({"art": ART, "miss": [0]})
        await asyncio.sleep(0.2)

    _drive({BOARD: board}, scenario)
    assert len(board.headers()) == 1 and board.numbers() == list(range(21))
    assert len(_art_lines(logs)) == 1


def test_a_miss_resends_exactly_the_chunks_it_names(relay_files, logs, fast):
    data = _picture(relay_files, ART, FIVE_KB)
    _page(relay_files, pi=ART)
    board = Board(drop={1, 3})

    async def scenario():
        await until(lambda: len(board.chunks()) == 21)
        assert board.shown == []                             # two chunks were lost on the way
        # what the board lacks, in its order, and things no chunk number is
        board.answer({"art": ART, "miss": [3, 1, 99, -1, "2", True, 3]})
        await until(lambda: _art_lines(logs))

    _drive({BOARD: board}, scenario)
    assert board.numbers() == list(range(21)) + [3, 1]
    assert board.headers() == [{"ab": ART, "al": FIVE_KB, "an": 21}]   # a resend has no header
    assert board.shown == [(ART, data)]
    (line,) = _art_lines(logs)
    assert re.fullmatch(rf"Art {ART} shown: {FIVE_KB} bytes in 21 chunks, 23 writes \(2 resent\), \d+ ms", line)


def test_a_picture_still_missing_after_3_resends_is_given_up(relay_files, logs, fast):
    _picture(relay_files, ART, 1000)                         # 4 chunks
    _page(relay_files, pi=ART)
    board = Board(auto_ok=False)

    async def scenario():
        for n in range(4):                                   # the first round, then three resends
            await until(lambda: len(board.chunks()) == 4 + n)
            board.answer({"art": ART, "miss": [0]})
        await until(lambda: _art_lines(logs))
        await asyncio.sleep(0.2)                             # and nothing more goes

    _drive({BOARD: board}, scenario)
    assert board.numbers() == [0, 1, 2, 3, 0, 0, 0]
    (line,) = _art_lines(logs)
    assert re.fullmatch(rf"Art {ART} given up, 1 of 4 chunks still missing after 3 resends:"
                        rf" 1000 bytes in 4 chunks, 7 writes \(3 resent\), \d+ ms", line)


def test_silence_gives_up_after_4_s(relay_files, logs, fast):
    _picture(relay_files, ART, 1000)
    _page(relay_files, pi=ART)
    board = Board(auto_ok=False)
    marks = {}

    async def scenario():
        await until(lambda: len(board.chunks()) == 4)
        marks["sent"] = time.monotonic()
        await until(lambda: _art_lines(logs), timeout=7)
        marks["given up"] = time.monotonic()
        await asyncio.sleep(0.2)                             # and nothing more goes

    _drive({BOARD: board}, scenario)
    assert 4.0 - CLOCK_SLACK <= marks["given up"] - marks["sent"] < 4.5
    (line,) = _art_lines(logs)
    assert re.fullmatch(rf"Art {ART} given up, no answer from the board in 4 s:"
                        rf" 1000 bytes in 4 chunks, 4 writes, \d+ ms", line)
    assert len(board.headers()) == 1 and board.numbers() == [0, 1, 2, 3]


def test_a_miss_3_2_s_after_the_last_chunk_is_still_heard(relay_files, logs, fast):
    """The board sends its miss 3 s after some moment the daemon cannot see, and the link
    takes a connection interval or two each way: timed from the board's last chunk, the miss
    lands a little after 3 s. The daemon still waits for it, with the real ART_ANSWER_WAIT."""
    data = _picture(relay_files, ART, 1000)                  # 4 chunks
    _page(relay_files, pi=ART)
    board = Board(drop={1})                                  # chunk 1 is lost on the way
    marks = {}

    async def scenario():
        await until(lambda: len(board.chunks()) == 4)
        marks["sent"] = time.monotonic()
        await asyncio.sleep(3.2)
        assert not _art_lines(logs)                          # not given up yet
        board.answer({"art": ART, "miss": [1]})
        await until(lambda: _art_lines(logs))

    _drive({BOARD: board}, scenario)
    assert board.numbers() == [0, 1, 2, 3, 1]
    resent_at = [t for u, _, _, t in board.writes if u == mod.ART_CHAR_UUID][-1]
    assert resent_at - marks["sent"] >= 3.2 - CLOCK_SLACK    # it answered the late miss
    assert board.shown == [(ART, data)]
    (line,) = _art_lines(logs)
    assert re.fullmatch(rf"Art {ART} shown: 1000 bytes in 4 chunks, 5 writes \(1 resent\), \d+ ms", line)


def test_an_ok_to_the_header_alone_keeps_the_chunks_home(relay_files, logs, monkeypatch):
    """A board that shows that picture already (it keeps its last one, and every new link sends
    the current page's picture again) may answer the header itself: no chunk goes then."""
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)
    monkeypatch.setattr(mod, "ART_CHUNK_GAP", 0.0)
    _picture(relay_files, ART, FIVE_KB)
    board = Board()
    write = board.client.write_gatt_char

    async def has_it(uuid, data, response=None):
        await write(uuid, data, response)
        if uuid == mod.RX_CHAR_UUID and b'"ab"' in bytes(data):
            asyncio.get_running_loop().call_soon(board.answer, {"art": ART, "ok": 1})

    board.client.write_gatt_char = has_it

    async def scenario(session):
        session.page_art(ART)
        await until(lambda: _art_lines(logs))

    _session_run(board, scenario)
    assert board.headers() == [{"ab": ART, "al": FIVE_KB, "an": 21}]
    assert board.chunks() == []
    (line,) = _art_lines(logs)
    # never the "shown" line, which is the proof that a picture went over the link
    assert re.fullmatch(rf"Art {ART} already on the board \(it answered the header\):"
                        rf" {FIVE_KB} bytes in 21 chunks, 0 writes, \d+ ms", line)


def test_only_an_answer_for_the_picture_going_out_counts(relay_files, logs):
    async def run():
        session = mod.Session(MagicMock(), BOARD)
        session._art_id = ART
        session._art_answer = answer = asyncio.get_running_loop().create_future()

        def tx(msg):
            session._on_tx(None, bytearray(json.dumps(msg).encode()))

        tx({"art": ART_B, "ok": 1})                          # another picture's answer, late
        tx({"art": ART})                                     # neither ok nor miss
        tx({"art": ART, "ok": 0})
        tx({"art": ART, "miss": "1,2"})
        tx({"ack": True})                                    # the plain ack, as ever
        assert not answer.done()
        tx({"art": ART, "miss": [1, 2]})
        assert answer.result() == {"art": ART, "miss": [1, 2]}
        tx({"art": ART, "ok": 1})                            # a second answer to an answered round
        assert answer.result() == {"art": ART, "miss": [1, 2]}

    asyncio.run(run())
    assert logs == []
    assert not (relay_files / "events").exists() and not (relay_files / "decisions").exists()


def test_an_answer_with_no_picture_going_out_is_dropped(relay_files, logs):
    session = mod.Session(MagicMock(), BOARD)
    session._on_tx(None, bytearray(b'{"art":"0123456789ab","ok":1}'))
    session._on_tx(None, bytearray(b'{"art":"0123456789ab","miss":[0]}'))
    assert logs == []
    assert not (relay_files / "events").exists()


# ---------------------------------------------------------------------------
# A newer id: the picture going out stops at its next chunk, one waiting never starts
# ---------------------------------------------------------------------------

def test_a_newer_id_takes_over_at_the_next_chunk(relay_files, logs, fast, monkeypatch):
    monkeypatch.setattr(mod, "ART_CHUNK_GAP", 0.05)
    _picture(relay_files, ART, FIVE_KB, seed=1)
    data_b = _picture(relay_files, ART_B, FIVE_KB, seed=2)
    _page(relay_files, pi=ART)
    board = Board()

    async def scenario():
        await until(lambda: len(board.chunks()) >= 3)
        _page(relay_files, pi=ART_B, p1="Next song")
        await until(lambda: len(_art_lines(logs)) == 2)

    _drive({BOARD: board}, scenario)
    page_b, header_b = board.at(_is_page(ART_B)), board.at(_is_header(ART_B))
    chunk_places = [i for i, (u, _, _, _) in enumerate(board.writes) if u == mod.ART_CHAR_UUID]
    a_places = [i for i in chunk_places if i < header_b]
    assert 3 <= len(a_places) < 21                           # not the whole of the first picture
    assert max(a_places) < page_b                            # and none of it after the page that named B
    assert [h["ab"] for h in board.headers()] == [ART, ART_B]
    assert [k for i, (k, _) in zip(chunk_places, board.chunks()) if i > header_b] == list(range(21))
    assert board.shown == [(ART_B, data_b)]
    first, second = _art_lines(logs)
    assert re.fullmatch(rf"Art {ART} left for a newer picture:"
                        rf" {FIVE_KB} bytes in 21 chunks, {len(a_places)} writes, \d+ ms", first)
    assert re.fullmatch(rf"Art {ART_B} shown: {FIVE_KB} bytes in 21 chunks, 21 writes, \d+ ms", second)


def test_a_newer_id_drops_a_picture_still_waiting_for_its_turn(relay_files, logs, monkeypatch):
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)
    monkeypatch.setattr(mod, "ART_CHUNK_GAP", 0.05)
    _picture(relay_files, ART, FIVE_KB, seed=1)
    _picture(relay_files, ART_B, FIVE_KB, seed=2)
    data_c = _picture(relay_files, ART_C, FIVE_KB, seed=3)
    board = Board()

    async def scenario(session):
        session.page_art(ART)
        await until(lambda: len(board.chunks()) == 2)       # the first picture is going out
        session.page_art(ART_B)                              # B waits for its turn,
        session.page_art(ART_C)                              # and C takes it before B starts
        await until(lambda: any(line.startswith(f"Art {ART_C} shown") for line in logs))

    _session_run(board, scenario)
    assert [h["ab"] for h in board.headers()] == [ART, ART_C]   # B never started
    assert board.shown == [(ART_C, data_c)]
    assert not any(ART_B in line for line in logs)
    first, second = _art_lines(logs)
    assert first.startswith(f"Art {ART} left for a newer picture: {FIVE_KB} bytes in 21 chunks, ")
    assert second.startswith(f"Art {ART_C} shown: {FIVE_KB} bytes in 21 chunks, 21 writes, ")


def test_a_page_back_on_the_picture_going_out_lets_it_finish(relay_files, logs, monkeypatch):
    """The page went to another id and straight back before the next chunk: the picture
    going out is still the right one, and the one in between never starts."""
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)
    monkeypatch.setattr(mod, "ART_CHUNK_GAP", 0.05)
    data = _picture(relay_files, ART, FIVE_KB, seed=1)
    _picture(relay_files, ART_B, FIVE_KB, seed=2)
    board = Board()

    async def scenario(session):
        session.page_art(ART)
        await until(lambda: len(board.chunks()) == 2)
        session.page_art(ART_B)
        session.page_art(ART)
        await until(lambda: _art_lines(logs))

    _session_run(board, scenario)
    assert board.headers() == [{"ab": ART, "al": FIVE_KB, "an": 21}]
    assert board.numbers() == list(range(21))
    assert board.shown == [(ART, data)]
    (line,) = _art_lines(logs)
    assert line.startswith(f"Art {ART} shown:")


def test_a_newer_id_with_no_picture_still_stops_the_old_one(relay_files, logs, fast, monkeypatch):
    """The board now shows a page for B, so A's picture is no use to it, art or none."""
    monkeypatch.setattr(mod, "ART_CHUNK_GAP", 0.05)
    _picture(relay_files, ART, FIVE_KB)
    _page(relay_files, pi=ART)
    board = Board()

    async def scenario():
        await until(lambda: len(board.chunks()) >= 3)
        _page(relay_files, pi=ART_B)                         # no art/fedcba987654.jpg
        await until(lambda: len(_art_lines(logs)) == 2)

    _drive({BOARD: board}, scenario)
    assert len(board.numbers()) < 21 and board.shown == []
    assert [h["ab"] for h in board.headers()] == [ART]
    first, second = _art_lines(logs)
    assert re.fullmatch(rf"Art {ART} left for a newer picture:"
                        rf" {FIVE_KB} bytes in 21 chunks, {len(board.numbers())} writes, \d+ ms", first)
    assert second.startswith(f"Art {ART_B}: no picture to send (")


def test_a_picture_goes_again_only_after_another_id(relay_files, logs, fast):
    """A page without art, or the same id again, leaves the board's last picture in place;
    another id in between means the first one must go again."""
    _picture(relay_files, ART, 1000, seed=1)
    _picture(relay_files, ART_B, 1000, seed=2)
    _page(relay_files, pi=ART)
    board = Board()

    def pages_with(**fields):
        return sum(all(m.get(k) == v for k, v in fields.items()) for m in board.messages())

    async def scenario():
        await until(lambda: len(board.shown) == 1)
        _page(relay_files, p1="Interlude")                   # a track with no art
        await until(lambda: pages_with(p1="Interlude"))
        _page(relay_files, pi=ART, p1="Song again")          # back on the first album
        await until(lambda: pages_with(p1="Song again"))
        await asyncio.sleep(0.1)
        assert len(board.headers()) == 1                     # nothing went for it
        _page(relay_files, pi=ART_B)
        await until(lambda: len(board.shown) == 2)
        _page(relay_files, pi=ART, p1="And again")
        await until(lambda: len(board.shown) == 3)

    _drive({BOARD: board}, scenario)
    assert [h["ab"] for h in board.headers()] == [ART, ART_B, ART]


@pytest.mark.parametrize("art", ["", "z", "abc1234"], ids=["empty", "1 character", "7 characters"])
def test_an_id_outside_the_pi_rule_rides_on_the_page_and_no_picture_goes(relay_files, logs, fast, art):
    """The board takes art for ids of 8 to 16 characters only; a shorter one is still relayed."""
    if art:
        _picture(relay_files, art, 1000)
    _page(relay_files, pi=art)
    board = Board()

    async def scenario():
        await until(lambda: len(board.messages()) >= 2)
        await asyncio.sleep(0.1)

    _drive({BOARD: board}, scenario)
    assert board.messages()[0] == {**PAGE, "pi": art}
    assert board.headers() == [] and board.chunks() == []
    assert not _art_lines(logs) and NO_CHARACTERISTIC not in logs


# ---------------------------------------------------------------------------
# What is not sent: a board that takes no art, and files that are no picture for it
# ---------------------------------------------------------------------------

def test_a_board_on_older_firmware_gets_its_pages_and_no_art(relay_files, logs, fast):
    _picture(relay_files, ART, 1000)
    _picture(relay_files, ART_B, 1000)
    _page(relay_files, pi=ART)
    first, again = Board(art=False), Board(art=False)

    async def two_ids():
        await until(lambda: any(m.get("pi") == ART for m in first.messages()))
        _page(relay_files, pi=ART_B)
        await until(lambda: any(m.get("pi") == ART_B for m in first.messages()))
        await asyncio.sleep(0.1)

    _drive({BOARD: first}, two_ids)
    assert first.headers() == [] and first.chunks() == []
    assert logs.count(NO_CHARACTERISTIC) == 1               # once for the link, not once a picture

    async def links_again():
        await until(lambda: any(m.get("pi") == ART_B for m in again.messages()))
        await asyncio.sleep(0.1)

    _drive({BOARD: again}, links_again)
    assert again.headers() == [] and again.chunks() == []
    assert logs.count(NO_CHARACTERISTIC) == 2               # a new link looks for itself
    assert not _art_lines(logs)


def test_a_board_whose_services_are_not_known_counts_as_older_firmware(relay_files, logs, fast):
    _picture(relay_files, ART, 1000)
    _page(relay_files, pi=ART)
    board = Board()
    type(board.client).services = PropertyMock(
        side_effect=mod.BleakError("Service Discovery has not been performed yet"))

    async def scenario():
        await until(lambda: any(m.get("pi") == ART for m in board.messages()))
        await asyncio.sleep(0.1)

    _drive({BOARD: board}, scenario)
    assert board.headers() == [] and board.chunks() == []
    assert logs.count(NO_CHARACTERISTIC) == 1


def test_a_link_that_cannot_hear_the_board_sends_no_art(relay_files, logs, fast):
    """Without TX the board's answers never come: every picture would wait out its 3 s."""
    _picture(relay_files, ART, 1000)
    _page(relay_files, pi=ART)
    board = Board()

    def refuse(uuid, callback):
        raise mod.BleakError("Could not start notify")

    board.client.start_notify = AsyncMock(side_effect=refuse)

    async def scenario():
        await until(lambda: any(m.get("pi") == ART for m in board.messages()))
        await asyncio.sleep(0.1)

    _drive({BOARD: board}, scenario)
    assert board.headers() == [] and board.chunks() == []
    assert logs.count("No TX answers on this link, so no album art on it") == 1


@pytest.mark.parametrize("size, chunks", [(24 * 1024, 98), (24 * 1024 + 1, None)],
                         ids=["24 KB", "a byte over"])
def test_a_picture_over_24_kb_is_not_sent(relay_files, logs, fast, size, chunks):
    data = _picture(relay_files, ART, size)
    _page(relay_files, pi=ART)
    board = Board()

    async def scenario():
        await until(lambda: _art_lines(logs))
        await asyncio.sleep(0.1)

    _drive({BOARD: board}, scenario)
    assert board.messages()[0] == {**PAGE, "pi": ART}       # the page goes either way
    if chunks:
        assert board.headers() == [{"ab": ART, "al": size, "an": chunks}]
        assert board.shown == [(ART, data)]
    else:
        assert board.headers() == [] and board.chunks() == []
        assert _art_lines(logs) == [f"Art {ART}: {size} bytes, over the {24 * 1024} a board takes, not sent"]


def test_a_missing_or_empty_picture_is_logged_once_and_not_sent(relay_files, logs, fast):
    _page(relay_files, pi=ART)                               # no art/0123456789ab.jpg
    board = Board()

    async def scenario():
        await until(lambda: _art_lines(logs))
        (relay_files / "art" / f"{ART_B}.jpg").parent.mkdir(parents=True, exist_ok=True)
        (relay_files / "art" / f"{ART_B}.jpg").write_bytes(b"")
        _page(relay_files, pi=ART_B)
        await until(lambda: len(_art_lines(logs)) == 2)
        _page(relay_files, pi=ART_B, pp=12)                  # the same id again: tried once is enough
        await until(lambda: any(m.get("pp") == 12 for m in board.messages()))
        await asyncio.sleep(0.1)

    _drive({BOARD: board}, scenario)
    first, second = _art_lines(logs)
    assert first.startswith(f"Art {ART}: no picture to send (")
    assert second == f"Art {ART_B}: the picture file is empty, not sent"
    assert board.headers() == [] and board.chunks() == []


# ---------------------------------------------------------------------------
# The link around it
# ---------------------------------------------------------------------------

def test_a_chunk_that_will_not_write_ends_the_picture_not_the_link(relay_files, logs, fast):
    _picture(relay_files, ART, 1000)
    _page(relay_files, pi=ART)
    board = Board()
    board.fail_chunk = 2

    async def scenario():
        await until(lambda: _art_lines(logs))
        mod._write_json_atomic(relay_files / "notify.json", {"title": "Still here", "expires": time.time() + 30})
        await until(lambda: any(m.get("nt") == "Still here" for m in board.messages()))

    _drive({BOARD: board}, scenario)
    assert board.numbers() == [0, 1]
    (line,) = _art_lines(logs)
    assert re.fullmatch(rf"Art {ART} given up, chunk 2 not written \(BleakError: Unreachable\):"
                        rf" 1000 bytes in 4 chunks, 2 writes, \d+ ms", line)


def test_a_header_that_will_not_write_gives_the_picture_up(relay_files, logs, monkeypatch):
    monkeypatch.setattr(mod, "WRITE_GAP", 0.0)
    _picture(relay_files, ART, 1000)
    board = Board()
    write = board.client.write_gatt_char

    async def no_header(uuid, data, response=None):
        if uuid == mod.RX_CHAR_UUID and b'"ab"' in bytes(data):
            raise mod.BleakError("Unreachable")
        await write(uuid, data, response)

    board.client.write_gatt_char = no_header

    async def scenario(session):
        session.page_art(ART)
        await until(lambda: _art_lines(logs))

    _session_run(board, scenario)
    assert board.headers() == [] and board.chunks() == []
    (line,) = _art_lines(logs)
    assert re.fullmatch(rf"Art {ART} given up, the header was not written:"
                        rf" 1000 bytes in 4 chunks, 0 writes, \d+ ms", line)


def test_a_link_that_ends_stops_its_picture_first(relay_files, logs, fast, monkeypatch):
    monkeypatch.setattr(mod, "ART_CHUNK_GAP", 0.05)
    _picture(relay_files, ART, FIVE_KB)
    _page(relay_files, pi=ART)
    board = Board()

    async def scenario():
        await until(lambda: len(board.chunks()) == 3)       # the link ends mid picture

    _drive({BOARD: board}, scenario, linger=0.3)             # time for several more chunks, were it going on
    assert 3 <= len(board.chunks()) < 21
    assert board.writes_at_disconnect == len(board.writes)  # nothing written once the link closed
    (line,) = _art_lines(logs)
    assert re.fullmatch(rf"Art {ART} stopped, the link ended:"
                        rf" {FIVE_KB} bytes in 21 chunks, {len(board.chunks())} writes, \d+ ms", line)


def test_every_board_gets_its_own_picture_at_its_own_size(relay_files, tagged_logs, fast):
    data = _picture(relay_files, ART, FIVE_KB)
    _page(relay_files, pi=ART)
    a, b = Board(mtu=256), Board(mtu=185, drop={2})

    async def scenario():
        await until(lambda: a.shown and len(b.chunks()) == 29)
        b.answer({"art": ART, "miss": [2]})                  # only B lost a chunk
        await until(lambda: len(_art_lines(tagged_logs)) == 2)

    _drive({BOARD: a, BOARD_B: b}, scenario)
    assert a.headers() == [{"ab": ART, "al": FIVE_KB, "an": 21}]
    assert b.headers() == [{"ab": ART, "al": FIVE_KB, "an": 29}]
    assert a.numbers() == list(range(21))
    assert b.numbers() == list(range(29)) + [2]             # the resend went to B alone
    assert a.shown == [(ART, data)] and b.shown == [(ART, data)]
    on_b, on_a = sorted(_art_lines(tagged_logs))             # each line carries its board's tag
    assert re.fullmatch(rf"\[{BOARD_B}\] Art {ART} shown: {FIVE_KB} bytes in 29 chunks,"
                        rf" 30 writes \(1 resent\), \d+ ms", on_b)
    assert re.fullmatch(rf"\[{BOARD}\] Art {ART} shown: {FIVE_KB} bytes in 21 chunks, 21 writes, \d+ ms", on_a)
