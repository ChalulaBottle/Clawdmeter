#!/usr/bin/env python3
"""Claude Usage Tracker Daemon — Windows (Phase 2).

Reads the Claude OAuth token from the native-Windows credentials path and
polls the Anthropic API for rate-limit utilization data. BLE glue added in
later plans.
"""

import asyncio
import calendar
import contextlib
import contextvars
import datetime
import json
import logging
import logging.handlers
import math
import os
import re
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
from bleak import BleakClient
from bleak.backends.device import BLEDevice
from bleak.backends.service import BleakGATTServiceCollection
from bleak.exc import BleakError

DEVICE_NAME = "ECHO_LabDaemon"
# The names the board advertised before the renames; a Windows bond made then keeps that one as
# the FriendlyName until the next pairing, so the bonded lookup accepts all of them.
DEVICE_NAMES = (DEVICE_NAME, "ECHO_MiniDaemon", "Clawdmeter")
SERVICE_UUID = "4c41555a-4465-7669-6365-000000000001"
RX_CHAR_UUID = "4c41555a-4465-7669-6365-000000000002"
TX_CHAR_UUID = "4c41555a-4465-7669-6365-000000000003"   # device -> host: ack/nack, approve answers
REQ_CHAR_UUID = "4c41555a-4465-7669-6365-000000000004"

POLL_INTERVAL = 60
TICK = 5
CONNECT_RETRIES = 3        # D-01: attempts before giving up on a device
CONNECT_RETRY_DELAY = 2.0  # D-01: seconds between failed connect attempts
ZOMBIE_BREAK_LIMIT = 1     # D-03: consecutive write failures before abandoning a half-open link
                           # N=1: breaks at T=60s, leaves ~60s headroom for reconnect+poll inside 120s SLA
                           # N=2 would bust the 120s budget before reconnect even begins
RECONNECT_BACKOFF_CAP = 8  # D-05: fast-reconnect cap (seconds); keeps stacked retries inside 120s SLA
                           # ~5–10s band per CONTEXT.md Claude's Discretion; 8 chosen as middle ground

# Optional reset chime.
# Optional clock display. 
# Config lives under the same Clawdmeter dir as daemon.log.
CONFIG_FILE = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "Clawdmeter" / "config"
# Host state for the display, written by clawdmeter_state.py (or any tool):
# {"agents": int, "anim": str, "mode": str}. Checked every tick; "agents" rides
# along as "n", a non-empty "anim" as "a". "mode" stays host-side.
STATE_FILE = CONFIG_FILE.parent / "state.json"
ANIM_MAX = 23              # firmware keeps the animation name in char[24]
# Approve relay (clawdmeter_approve.py <-> device). The hook writes approve.json
# {"id", "tool", "text", "expires"}; the daemon puts it on the device at once as
# its own message, and when the device answers, writes decisions/<id>.json for
# the hook to pick up. The heartbeat lets the hook fall through to the terminal
# in milliseconds when no connected daemon is around to relay.
APPROVE_FILE = CONFIG_FILE.parent / "approve.json"
DECISION_DIR = CONFIG_FILE.parent / "decisions"
HEARTBEAT_FILE = CONFIG_FILE.parent / "daemon.heartbeat"   # {"ts", "connected"}
APPROVE_ID_MAX = 23        # firmware keeps the id in char[24]
APPROVE_TOOL_MAX = 23
APPROVE_TEXT_MAX = 96      # what fits on the panel; the terminal has the whole thing
WATCH_TICK = 1.0           # state / approve file checks; TICK stays the poll cadence
# LabDaemon relay (plans/labdaemon.md, Protocol). The engine drops notify.json and
# page.json here the same atomic way the hook drops approve.json; the daemon puts
# each change on the boards as its own message, never merged into usage:
#   notify.json {"title", "body", "secs", "expires"}                         sent as {"nt", "nb", "nx"}
#   page.json   {"pg", "pt", "p1", "p2", "p3", "pp", "pa", "pi", "expires"}  sent as {"pg", "pt", "p1", "p2", "p3", "pp", "pa", "pi"}
# A button press on a board comes back as events/<ns>.json {"btn", "scr", "addr", "ts"}.
# art/<id>.jpg is the engine's album picture for a page's "pi"; it goes to a board over the
# link itself (ART_CHAR_UUID below).
# wifi.json {"ssid", "pass"} is the operator's (the engine's `wifi set` writes it), for the boards
# built with Wi-Fi: it goes ONCE to every linked board as {"wf": ssid, "wp": pass} ({"wf": ""} for
# an empty ssid: forget the network) and is removed once a board took it. Nothing of it ever
# reaches the log.
NOTIFY_FILE = CONFIG_FILE.parent / "notify.json"
PAGE_FILE = CONFIG_FILE.parent / "page.json"
EVENT_DIR = CONFIG_FILE.parent / "events"
WIFI_FILE = CONFIG_FILE.parent / "wifi.json"
NOTIFY_TITLE_MAX = 23
NOTIFY_BODY_MAX = 96
NOTIFY_SECS_DEFAULT = 8    # seconds on screen when "secs" is left out
NOTIFY_SECS_MAX = 3600     # a runaway "secs" still leaves a sane number on the board
PAGE_NAME_MAX = 15
PAGE_TITLE_MAX = 23
PAGE_LINE_MAX = 40         # p1, p2 and p3 each
PAGE_ANIM_MAX = ANIM_MAX   # "pa" names a creature animation: the same char[24] as "a"
PAGE_ART_ID = re.compile(r"[a-z0-9]{0,16}")   # "pi", the album art id: relayed unchanged in this shape
EVENT_FIELD_MAX = 15       # "btn" and "scr" are short words ("pwr2", "notify")
WIFI_SSID_MAX = 32         # ssid, in bytes of UTF-8: the 802.11 limit, and the board takes no more
WIFI_PASS_MIN = 8          # pass, in bytes of UTF-8: empty (an open network), or a WPA passphrase
WIFI_PASS_MAX = 63         # of 8 to 63 characters, the rule of the board and the engine's wifi set,
WIFI_PSK = re.compile(r"[0-9A-Fa-f]{64}")   # or pass is a raw key: exactly 64 hex digits, no more
# The board holds ONE incoming message until its loop reads it (firmware ble.cpp
# rx_buf), so a second write landing first overwrites the first. Writes to one board
# keep this many seconds apart; in practice only a same-tick burst (state resend,
# prompt, notification, page) ever waits.
WRITE_GAP = 0.25
# One message on the wire: a write without response carries at most the ATT MTU less
# 3 bytes, and the board keeps at most 511 bytes of it (rx_buf). The boards ask for an
# MTU of 256 (their NimBLE build config), so 253 is assumed until the link reports one.
WIRE_MAX_ASSUMED = 253
WIRE_MAX_BOARD = 511
# The boards the daemon last sent a live page to, kept past the link and the tray, so a
# board that links again after page.json went away is told to drop the page it shows.
PAGE_BOARDS_FILE = CONFIG_FILE.parent / "daemon.pages"   # {"boards": [address, ...]}
# Album art over the link (plans/labdaemon.md, Increment 2b), so a board needs no network for it.
# When a page whose "pi" is new on a link goes to a board, the daemon streams the engine's cached
# picture ART_DIR/<pi>.jpg to that board: the header {"ab": id, "al": bytes, "an": chunks} on RX
# like any other message, then chunk k on ART_CHAR_UUID, write without response: k as 2 bytes
# little endian, then the next art_chunk_size() bytes of the file, the link's MTU less 5 and at
# most 510 (the last chunk carries what is left). The board answers on TX with {"art": id, "ok": 1}
# once it shows the picture, or with {"art": id, "miss": [k, ...]} for the chunks it lacks, which
# go again.
ART_CHAR_UUID = "4c41555a-4465-7669-6365-000000000005"   # host to device: album art chunks, binary
ART_DIR = CONFIG_FILE.parent / "art"   # the engine's art cache, <id>.jpg
ART_ID = re.compile(r"[a-z0-9]{8,16}")   # the ids a board takes art for (the "pi" rule); others ride on the page only
ART_FILE_MAX = 24 * 1024   # the board puts a picture together in a buffer of this size
# One chunk write at most: an attribute value never holds more (ATT), whatever the MTU. The
# board's message buffer (WIRE_MAX_BOARD) has nothing to do with it: a chunk lands in its
# picture buffer.
ART_CHUNK_MAX = 512
# Seconds asked for between two chunk writes, so the tick loop and the other boards go in
# between. The Windows clock moves in steps of 15.6 ms, so with the loop idle the gap comes out
# about 16 ms.
ART_CHUNK_GAP = 0.008
# Seconds the board has to answer a round of chunks, counted from the round's last write. The
# board's own timer is 3 s; the second more covers whichever moment it counts from (the header,
# its last chunk, its last miss) and the link's delivery both ways. At exactly 3 s a miss timed
# from the board's last chunk would always come just after the daemon gave the picture up.
ART_ANSWER_WAIT = 4.0
ART_RESEND_ROUNDS = 3      # rounds of resent chunks before a picture is given up

API_URL = "https://api.anthropic.com/v1/messages"
API_HEADERS_TEMPLATE = {
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "oauth-2025-04-20",
    "Content-Type": "application/json",
    "User-Agent": "claude-code/2.1.5",
}
API_BODY = {
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 1,
    "messages": [{"role": "user", "content": "hi"}],
}


def _build_file_logger() -> logging.Logger | None:
    """Create a rotating file logger for field diagnostics, or None.

    Autostart launches the tray under pythonw.exe, which has no console — stdout
    is discarded (and is in fact None, making print() unsafe). A rotating file is
    then the ONLY trail when the daemon stalls in the field. Windows-only: on the
    Linux dev box / CI the console print() suffices, and gating to win32 keeps the
    pure-helper unit tests from writing stray log files.
    """
    if sys.platform != "win32":
        return None
    logger = logging.getLogger("clawdmeter.daemon")
    if logger.handlers:
        return logger  # idempotent across re-import (tray imports this module)
    base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    path = base / "Clawdmeter" / "daemon.log"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        handler = logging.handlers.RotatingFileHandler(
            path, maxBytes=512 * 1024, backupCount=3, encoding="utf-8"
        )
    except OSError:
        return None  # best-effort — logging setup must never stop the daemon
    handler.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%Y-%m-%d %H:%M:%S"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


_FILE_LOGGER = _build_file_logger()

# With several boards, each board's link tags its log lines with the board address so
# one daemon.log still tells them apart. Empty (no tag at all) with a single board.
_LOG_TAG: contextvars.ContextVar[str] = contextvars.ContextVar("log_tag", default="")


def log(msg: str) -> None:
    msg = _LOG_TAG.get() + msg
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    # Under pythonw sys.stdout is None and print() would raise — guard it so a
    # missing console can never crash the daemon thread (the silent-freeze mode).
    try:
        print(line, flush=True)
    except (OSError, ValueError, AttributeError, RuntimeError):
        pass
    if _FILE_LOGGER is not None:
        _FILE_LOGGER.info(msg)


class AuthError(Exception):
    """Raised by poll_api on a genuine 401/403 — the token really is expired or
    invalid and the user must re-run `claude login`. Distinct from a None return,
    which means a TRANSIENT failure (network/DNS, timeout, rate-limit, 5xx) that
    must NOT be mislabeled as a token problem (SC#5: a boot-time `getaddrinfo
    failed` DNS blip wrongly fired the 'token expired' toast)."""

def read_chime_setting() -> str:
    """Read the `chime` option from the config file. One of: off|on.

    Defaults to "off" so the device stays silent until the user opts in.
    """
    try:
        if CONFIG_FILE.exists():
            for line in CONFIG_FILE.read_text().splitlines():
                line = line.split("#", 1)[0].strip()
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                if key.strip().lower() == "chime":
                    val = val.strip().lower()
                    if val in ("off", "on"):
                        return val
    except OSError:
        pass
    return "off"


def read_clock_setting() -> str:
    """Read the `clock` option from the config file. One of: off|auto|12|24.

    Defaults to "off" so existing setups keep showing "Usage" until opted in.
    """
    try:
        if CONFIG_FILE.exists():
            for line in CONFIG_FILE.read_text().splitlines():
                line = line.split("#", 1)[0].strip()
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                if key.strip().lower() == "clock":
                    val = val.strip().lower()
                    if val in ("off", "auto", "12", "24"):
                        return val
    except OSError:
        pass
    return "off"


def add_chime_field(payload: dict) -> None:
    """Add "c":1 to the payload when the config opts in, so the firmware may
    sound the session-reset chime. Omitted entirely when chime is off."""
    if read_chime_setting() == "on":
        payload["c"] = 1


def detect_hour_format() -> int:
    """Best-effort 12h/24h detection on Windows via the registry. Returns 12 or 24."""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\International") as k:
            # iTime: "1" = 24-hour, "0" = 12-hour.
            val, _ = winreg.QueryValueEx(k, "iTime")
            return 24 if str(val).strip() == "1" else 12
    except (ImportError, OSError):
        return 24


def add_clock_fields(payload: dict) -> None:
    """Add "t" (local wall-clock epoch) + "tf" (12|24) when the config opts in."""
    clock = read_clock_setting()
    if clock == "off":
        return
    tf = 24 if clock == "24" else 12 if clock == "12" else detect_hour_format()
    payload["t"] = int(time.time()) + time.localtime().tm_gmtoff
    payload["tf"] = tf


def state_stamp() -> tuple | None:
    """Change stamp of the state file, or None when it is absent.

    mtime alone can repeat for two writes inside one clock tick; size and the
    file id (a fresh one on every atomic replace) catch those.
    """
    try:
        st = STATE_FILE.stat()
    except OSError:
        return None
    return (st.st_mtime_ns, st.st_size, st.st_ino)


def read_state_fields() -> dict | None:
    """Payload fields from the state file: "n" (agents working) whenever the file
    is present, "a" (splash animation) only when non-empty.

    Absent file -> {} (nothing to merge). Unreadable or malformed -> None after a
    log line, and the caller keeps the last good state — a bad write must never
    take the poll loop down.
    """
    try:
        raw = STATE_FILE.read_bytes()
    except FileNotFoundError:
        return {}
    except OSError as e:
        log(f"State file unreadable, ignoring: {e}")
        return None
    try:
        # From bytes so a BOM or UTF-16 (PowerShell Out-File) still parses.
        data = json.loads(raw)
    except ValueError as e:  # JSONDecodeError and UnicodeDecodeError alike
        log(f"State file malformed, ignoring: {e}")
        return None
    if not isinstance(data, dict):
        log("State file malformed (not a JSON object), ignoring")
        return None
    agents = data.get("agents")
    anim = data.get("anim")
    agents = 0 if agents is None else agents
    anim = "" if anim is None else anim
    if (isinstance(agents, bool) or not isinstance(agents, int) or agents < 0
            or not isinstance(anim, str) or len(anim) > ANIM_MAX):
        log(f"State file malformed (agents: whole number >= 0, anim: name up to"
            f" {ANIM_MAX} chars), ignoring")
        return None
    fields = {"n": min(agents, 99)}  # the device shows two digits
    if anim:
        fields["a"] = anim
    return fields


def _file_stamp(path: Path) -> tuple | None:
    try:
        st = path.stat()
    except OSError:
        return None
    return (st.st_mtime_ns, st.st_size, st.st_ino)


def approve_stamp() -> tuple | None:
    """Change stamp of the approve file (same idea as state_stamp)."""
    return _file_stamp(APPROVE_FILE)


def _approve_id_ok(value) -> bool:
    return (isinstance(value, str) and 0 < len(value) <= APPROVE_ID_MAX
            and all(c.isalnum() or c in "-_" for c in value))


def read_approve_msg() -> dict | None:
    """The device message for the approve file.

    Pending request -> {"q": id, "qt": tool, "qs": text, "qx": seconds left}.
    Absent file, or one already past its "expires" -> {"q": ""} (clear).
    Unreadable or malformed -> None after a log line; the caller sends nothing.
    """
    try:
        raw = APPROVE_FILE.read_bytes()
    except FileNotFoundError:
        return {"q": ""}
    except OSError as e:
        log(f"Approve file unreadable, ignoring: {e}")
        return None
    try:
        data = json.loads(raw)
    except ValueError as e:
        log(f"Approve file malformed, ignoring: {e}")
        return None
    if not isinstance(data, dict) or not _approve_id_ok(data.get("id")):
        log("Approve file malformed (needs an id of up to 23 letters, digits, - or _), ignoring")
        return None
    expires = data.get("expires")
    left = 0
    if isinstance(expires, (int, float)) and not isinstance(expires, bool):
        left = int(expires - time.time())
    if left <= 0:
        return {"q": ""}
    tool = data.get("tool")
    text = data.get("text")
    return {
        "q": data["id"],
        "qt": (tool if isinstance(tool, str) else "")[:APPROVE_TOOL_MAX],
        "qs": (text if isinstance(text, str) else "")[:APPROVE_TEXT_MAX],
        "qx": left,
    }


def _finite_number(value) -> bool:
    """A usable JSON number: not a bool, not NaN or Infinity (json.loads takes both), and
    not an integer too long for a float (over about 309 digits), on which math.isfinite
    and any sum with a float raise OverflowError."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return math.isfinite(value)
    except (OverflowError, TypeError, ValueError):
        return False


def _seconds_left(expires) -> float:
    """Seconds until an "expires" Unix time; 0 when it is missing or not a usable number."""
    return expires - time.time() if _finite_number(expires) else 0.0


_CONTROL = re.compile(r"[\x00-\x09\x0b-\x1f]")   # control characters, the newline left out


def _text(value, limit: int) -> str:
    """A text field as the board keeps it: at most `limit` bytes of UTF-8, never cut inside
    a character (the board's caps are bytes too), and control characters other than a
    newline as spaces, which is how the board shows them. Anything that is not text is
    empty. A lone surrogate, which json.loads lets through, becomes "?"."""
    if not isinstance(value, str):
        return ""
    raw = _CONTROL.sub(" ", value).encode("utf-8", "replace")
    return raw[:limit].decode("utf-8", "ignore")


def _read_relay_object(path: Path, label: str) -> dict | None:
    """The JSON object in a relay file, or {} when there is no file.

    Unreadable or malformed: None after a log line; the caller sends nothing.
    """
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        return {}
    except OSError as e:
        log(f"{label} file unreadable, ignoring: {e}")
        return None
    try:
        # From bytes so a BOM or UTF-16 (PowerShell Out-File) still parses.
        data = json.loads(raw)
    except ValueError as e:  # JSONDecodeError and UnicodeDecodeError alike
        log(f"{label} file malformed, ignoring: {e}")
        return None
    if not isinstance(data, dict):
        log(f"{label} file malformed (not a JSON object), ignoring")
        return None
    return data


def notify_stamp() -> tuple | None:
    """Change stamp of the notify file (same idea as state_stamp)."""
    return _file_stamp(NOTIFY_FILE)


def read_notify_msg() -> dict | None:
    """The device message for the notify file.

    A live notification gives {"nt": title, "nb": body, "nx": seconds on screen}; nx is
    "secs" (NOTIFY_SECS_DEFAULT when left out) cut to the time left before "expires",
    so a late relay never overstays.
    No file, one past its "expires" (or without one), or one with neither a title nor a
    body gives {"nt": "", "nb": ""} (clear).
    Unreadable or malformed: None after a log line; the caller sends nothing.
    """
    data = _read_relay_object(NOTIFY_FILE, "Notify")
    if data is None:
        return None
    left = _seconds_left(data.get("expires"))
    title = _text(data.get("title"), NOTIFY_TITLE_MAX)
    body = _text(data.get("body"), NOTIFY_BODY_MAX)
    if left <= 0 or not (title or body):
        return {"nt": "", "nb": ""}
    secs = data.get("secs")
    if not _finite_number(secs) or secs <= 0:
        secs = NOTIFY_SECS_DEFAULT
    return {"nt": title, "nb": body, "nx": math.ceil(min(secs, left, NOTIFY_SECS_MAX))}


def page_stamp() -> tuple | None:
    """Change stamp of the page file (same idea as state_stamp)."""
    return _file_stamp(PAGE_FILE)


def read_page_msg() -> tuple[dict, float] | None:
    """The device message for the page file, and the Unix time the page lapses.

    A live page gives ({"pg", "pt", "p1", "p2", "p3", "pp", "pa"}, its "expires"). The
    page message has no timer field, so the caller clears the page itself once that
    time passes. "pp" is progress 0 to 100, or -1 for no bar.
    "pi", the album art id, rides along unchanged when the file has one of 0 to 16
    characters, each a to z or 0 to 9; any other value leaves the field off, never the
    page. It is in the message before any cut to fit, and never cut itself (_SHRINK_ORDER).
    No file, an empty "pg", or one past its "expires" (or without one) gives
    ({"pg": ""}, 0.0) (clear).
    Unreadable or malformed (no "pg" text): None after a log line; the caller sends nothing.
    """
    data = _read_relay_object(PAGE_FILE, "Page")
    if data is None:
        return None
    if not data:
        return {"pg": ""}, 0.0
    name = data.get("pg")
    if not isinstance(name, str):
        log("Page file malformed (needs a page name in pg), ignoring")
        return None
    expires = data.get("expires")
    if not name or _seconds_left(expires) <= 0:
        return {"pg": ""}, 0.0
    progress = data.get("pp")
    progress = max(-1, min(100, round(progress))) if _finite_number(progress) else -1
    msg = {
        "pg": _text(name, PAGE_NAME_MAX),
        "pt": _text(data.get("pt"), PAGE_TITLE_MAX),
        "p1": _text(data.get("p1"), PAGE_LINE_MAX),
        "p2": _text(data.get("p2"), PAGE_LINE_MAX),
        "p3": _text(data.get("p3"), PAGE_LINE_MAX),
        "pp": progress,
        "pa": _text(data.get("pa"), PAGE_ANIM_MAX),
    }
    art = data.get("pi")
    if isinstance(art, str) and PAGE_ART_ID.fullmatch(art):
        msg["pi"] = art
    return msg, float(expires)


def _page_sans_progress(msg: dict) -> dict:
    return {k: v for k, v in msg.items() if k != "pp"}


_FIRST_TICK = object()   # a page stamp no file has: a link's first tick always reads page.json
_PAGED: set | None = None   # PAGE_BOARDS_FILE, read once per process; None until then


def _paged() -> set:
    """The addresses of the boards the daemon last sent a live page to, with no clear since."""
    global _PAGED
    if _PAGED is None:
        _PAGED = set()
        try:
            data = json.loads(PAGE_BOARDS_FILE.read_bytes())
        except FileNotFoundError:
            data = {}
        except (OSError, ValueError) as e:
            log(f"Page record unreadable, starting without it: {e}")
            data = {}
        boards = data.get("boards") if isinstance(data, dict) else None
        if isinstance(boards, list):
            _PAGED.update(a for a in boards if isinstance(a, str))
    return _PAGED


def _note_page(address: str, shown: bool) -> None:
    """Record whether the board at `address` now shows a page from the daemon. The file
    is rewritten only when that changes (a page appearing or going), never for an update."""
    paged = _paged()
    if (address in paged) == shown:
        return
    if shown:
        paged.add(address)
    else:
        paged.discard(address)
    try:
        _write_json_atomic(PAGE_BOARDS_FILE, {"boards": sorted(paged)})
    except OSError as e:
        log(f"Page record write failed: {e}")


def _write_json_atomic(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(obj), encoding="utf-8")
    os.replace(tmp, path)


def write_heartbeat(connected: bool) -> None:
    """Best effort: the hook reads this to decide whether relaying is worth a wait."""
    try:
        _write_json_atomic(HEARTBEAT_FILE, {"ts": time.time(), "connected": bool(connected)})
    except OSError as e:
        log(f"Heartbeat write failed: {e}")


def write_decision(request_id: str, behavior: str = "allow") -> None:
    """decisions/<id>.json for the waiting hook."""
    try:
        _write_json_atomic(DECISION_DIR / f"{request_id}.json",
                           {"id": request_id, "behavior": behavior, "ts": time.time()})
    except OSError as e:
        log(f"Decision write failed: {e}")


def _token_ok(value, limit: int) -> bool:
    return (isinstance(value, str) and 0 < len(value) <= limit
            and all(c.isalnum() or c in "-_" for c in value))


_last_event_ns = 0  # the newest events/ file name so far, shared by every board


def write_event(btn, scr, addr: str) -> None:
    """events/<ns>.json for the engine: one button press on a board.

    {"btn": "pwr", "aux", or the double taps "pwr2" and "aux2", "scr": the screen it was
    pressed on, "addr": the board's address, "ts"}. The name check is by shape (letters,
    digits, - or _, up to EVENT_FIELD_MAX), so it takes every name the protocol has and
    leaves the meaning to the engine. The file name is a nanosecond time that only ever
    grows, even inside one clock step (time.time() moves in coarse steps on Windows), so
    two quick presses never share a file and sorting the names replays them in order.
    """
    global _last_event_ns
    if not _token_ok(btn, EVENT_FIELD_MAX):
        log(f"Device sent a button press with a bad name, ignoring: {btn!r}")
        return
    if not _token_ok(scr, EVENT_FIELD_MAX):
        scr = ""
    ns = max(time.time_ns(), _last_event_ns + 1)
    _last_event_ns = ns
    log(f"Device button {btn} on {scr or 'an unnamed screen'} ({addr or 'address unknown'})")
    try:
        _write_json_atomic(EVENT_DIR / f"{ns}.json",
                           {"btn": btn, "scr": scr, "addr": addr, "ts": time.time()})
    except OSError as e:
        log(f"Event write failed: {e}")


def wifi_stamp() -> tuple | None:
    """Change stamp of the Wi-Fi file (same idea as state_stamp)."""
    return _file_stamp(WIFI_FILE)


def _wifi_text_ok(value, limit: int) -> bool:
    """Text of at most `limit` bytes of UTF-8. A lone surrogate, which json.loads lets
    through, has no UTF-8 form, so it is not text here."""
    if not isinstance(value, str):
        return False
    try:
        return len(value.encode("utf-8")) <= limit
    except UnicodeEncodeError:
        return False


def _wifi_pass_ok(value) -> bool:
    """A pass the board can take: empty (an open network), a passphrase of WIFI_PASS_MIN to
    WIFI_PASS_MAX bytes of UTF-8, or a raw key of exactly 64 hex digits (what the engine's
    `wifi set` writes for one). The board refuses anything else (firmware wifi_link.cpp,
    pass_ok), so a file with it is kept for the operator to fix instead of being sent, refused
    and deleted. Nothing else of 64 bytes or more: the board reads a 64 byte pass as a raw key
    and refuses one that is not hex."""
    if isinstance(value, str) and (value == "" or WIFI_PSK.fullmatch(value)):
        return True
    return _wifi_text_ok(value, WIFI_PASS_MAX) and len(value.encode("utf-8")) >= WIFI_PASS_MIN


def read_wifi_msg() -> dict | None:
    """The board message for the Wi-Fi file: {"wf": ssid, "wp": pass}, or {"wf": ""} when
    ssid is empty (the boards forget the network; pass does not matter then). ssid is text
    of at most WIFI_SSID_MAX bytes of UTF-8, pass as _wifi_pass_ok says. An open network
    is an empty pass, but pass must be there: a missing one is more likely a typo.

    No file: None. Malformed: None after a log line. A file that is there but cannot be
    read right now (another program holding it, say) raises the OSError: it is not
    malformed, and the caller reads it again. Nothing from the file reaches the log, not
    even inside an error message (a decode error quotes a byte).
    """
    try:
        raw = WIFI_FILE.read_bytes()
    except FileNotFoundError:
        return None
    try:
        data = json.loads(raw)  # from bytes, so a BOM or UTF-16 (PowerShell Out-File) still parses
    except ValueError:
        data = None
    ssid = data.get("ssid") if isinstance(data, dict) else None
    if ssid == "":
        return {"wf": ""}
    password = data.get("pass") if isinstance(data, dict) else None
    if not (_wifi_text_ok(ssid, WIFI_SSID_MAX) and _wifi_pass_ok(password)):
        log(f"Wi-Fi file malformed (needs an ssid of up to {WIFI_SSID_MAX} bytes and a pass that is"
            f" empty, {WIFI_PASS_MIN} to {WIFI_PASS_MAX} bytes or 64 hex digits), ignoring")
        return None
    return {"wf": ssid, "wp": password}


def _read_art(pi: str) -> bytes | None:
    """The picture for art id `pi` from the engine's cache (ART_DIR), or None after a log line:
    no such file, an empty one, or one larger than a board takes (ART_FILE_MAX)."""
    try:
        with open(ART_DIR / f"{pi}.jpg", "rb") as f:
            size = os.fstat(f.fileno()).st_size
            data = f.read(ART_FILE_MAX + 1)
    except OSError as e:
        log(f"Art {pi}: no picture to send ({e.strerror or type(e).__name__})")
        return None
    if len(data) > ART_FILE_MAX:
        log(f"Art {pi}: {max(size, len(data))} bytes, over the {ART_FILE_MAX} a board takes, not sent")
        return None
    if not data:
        log(f"Art {pi}: the picture file is empty, not sent")
        return None
    return data


def _art_missing(miss, count: int) -> list[int]:
    """The chunk numbers in a board's "miss" list that a picture of `count` chunks has, in the
    board's order, each once. Anything else in the list is dropped."""
    todo: list[int] = []
    if isinstance(miss, list):
        for k in miss:
            if isinstance(k, int) and not isinstance(k, bool) and 0 <= k < count and k not in todo:
                todo.append(k)
    return todo


def _drop_wifi_file(stamp: tuple) -> str | None:
    """Remove the Wi-Fi file if it is still the version with that stamp. None once that
    version is gone, else why it is still there. A version written since is left alone
    for its own turn."""
    if wifi_stamp() != stamp:
        return None
    try:
        WIFI_FILE.unlink(missing_ok=True)
    except OSError as e:
        return e.strerror or type(e).__name__
    return None


async def poll_api(token: str) -> dict | None:
    headers = dict(API_HEADERS_TEMPLATE)
    headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            resp = await http.post(API_URL, headers=headers, json=API_BODY)
    except httpx.HTTPError as e:
        # Network/DNS/timeout — transient. Return None (no toast), retry next tick.
        log(f"API call failed: {e}")
        return None
    if resp.status_code in (401, 403):
        # Genuine auth rejection — the ONLY case that warrants the actionable
        # "run claude login" toast.
        log(f"API HTTP {resp.status_code}: {resp.text[:200]}")
        raise AuthError(resp.status_code)
    if resp.status_code >= 400:
        # Other 4xx/5xx (rate-limit, server error) — transient, not a token issue.
        log(f"API HTTP {resp.status_code}: {resp.text[:200]}")
        return None

    def hdr(name: str, default: str = "0") -> str:
        return resp.headers.get(name, default)

    now = time.time()

    def reset_minutes(reset_ts: str) -> int:
        try:
            r = float(reset_ts)
        except ValueError:
            return 0
        mins = (r - now) / 60.0
        return int(round(mins)) if mins > 0 else 0

    def pct(util: str) -> int:
        try:
            return int(round(float(util) * 100))
        except ValueError:
            return 0

    if resp.headers.get("anthropic-ratelimit-unified-5h-utilization"):
        payload = {
            "s": pct(hdr("anthropic-ratelimit-unified-5h-utilization")),
            "sr": reset_minutes(hdr("anthropic-ratelimit-unified-5h-reset")),
            "w": pct(hdr("anthropic-ratelimit-unified-7d-utilization")),
            "wr": reset_minutes(hdr("anthropic-ratelimit-unified-7d-reset")),
            "st": hdr("anthropic-ratelimit-unified-5h-status", "unknown"),
            "acct": "pro",
            "ok": True,
        }
    else:
        reset_ts = hdr("anthropic-ratelimit-unified-overage-reset")
        payload = {
            "s": pct(hdr("anthropic-ratelimit-unified-overage-utilization")),
            "sr": reset_minutes(reset_ts),
            "w": 0,
            "wr": 0,
            "st": hdr("anthropic-ratelimit-unified-status", "unknown"),
            "acct": "ent",
            **_billing_period_info(now, reset_ts),
            "ok": True,
        }
    add_chime_field(payload)   # adds "c":1 iff the config opts in
    add_clock_fields(payload)   # adds "t" + "tf" iff the config opts in
    return payload


def _billing_period_info(now: float, reset_ts: str) -> dict:
    """Fraction of billing period elapsed (tp, 0-100) and period length in days (pd).

    Monthly window is assumed (headers expose only reset_ts, not period). Per the
    Claude Enterprise Admin API reference, spend-limit period's "only value today
    is monthly" — see the macOS daemon for the full note.
    """
    try:
        period_end = float(reset_ts)
    except ValueError:
        return {"tp": 0, "pd": 30, "rd": ""}
    if period_end <= 0:
        # reset_ts defaults to "0" whenever the overage-reset header is absent
        # (e.g. a 200 that simply carries no billing headers). fromtimestamp(0)
        # is 1970; stepping one month back lands in 1969, and datetime.timestamp()
        # raises OSError for pre-1970 dates on Windows — taking the whole poll
        # loop down. Bail out to the neutral default instead.
        return {"tp": 0, "pd": 30, "rd": ""}
    try:
        dt_end = datetime.datetime.fromtimestamp(period_end)
        prev_month = dt_end.month - 1 or 12
        prev_year = dt_end.year if dt_end.month > 1 else dt_end.year - 1
        prev_day = min(dt_end.day, calendar.monthrange(prev_year, prev_month)[1])
        dt_start = dt_end.replace(year=prev_year, month=prev_month, day=prev_day)
        period_start = dt_start.timestamp()
    except (OSError, OverflowError, ValueError):
        # Belt-and-braces beyond the <= 0 guard above (#104): Windows
        # datetime.timestamp()/fromtimestamp() also raise OSError(22)/
        # OverflowError/ValueError for out-of-range NON-zero values (e.g. a
        # far-future "99999999999999" header, which overflows fromtimestamp).
        # Garbage must never crash the daemon thread — degrade to the safe
        # default instead (field report: OSError(22) killed the poll loop).
        return {"tp": 0, "pd": 30, "rd": ""}
    period_len = period_end - period_start
    if period_len <= 0:
        return {"tp": 0, "pd": 30, "rd": ""}
    pct_val = (now - period_start) / period_len * 100
    return {
        "tp": max(0, min(100, int(round(pct_val)))),
        "pd": int(round(period_len / 86400)),
        "rd": f"{dt_end.strftime('%b')} {dt_end.day}",
    }


def _mac_from_pnp_instance_id(instance_id: str) -> str | None:
    """Recover a canonical BLE MAC ("AA:BB:CC:DD:EE:FF") from a PnP instance id.

    Windows encodes a paired BLE device's address in its PnP instance id as a
    12-hex run after a ``DEV_`` token, e.g.::

        BTHLE\\DEV_98A316A5D706\\7&B8081D1&0&98A316A5D706  ->  98:A3:16:A5:D7:06

    Returns None when no ``DEV_<12 hex>`` token is present. Pure — the
    subprocess that produces the instance id lives in _bonded_pnp_ids().
    """
    m = re.search(r"DEV_([0-9A-Fa-f]{12})(?![0-9A-Fa-f])", instance_id)
    if not m:
        return None
    h = m.group(1).upper()
    return ":".join(h[i:i + 2] for i in range(0, 12, 2))


def _bonded_pnp_ids() -> list[str]:
    """InstanceIds of the Bluetooth PnP entries named like the board, one per line.

    The only place that runs the PowerShell lookup. Non-Windows or any failure
    returns [].
    """
    if sys.platform != "win32":
        return []
    command = (
        "Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | "
        "Where-Object { $_.FriendlyName -in @(" + ", ".join(f"'{n}'" for n in DEVICE_NAMES) + ") } | "
        "Select-Object -ExpandProperty InstanceId"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError) as e:
        log(f"Bonded-address lookup failed: {e}")
        return []
    return result.stdout.splitlines()


_BONDED: list[str] = []   # what the latest bond lookup found


def discover_bonded_addresses() -> list[str]:
    """Return the BLE address of EVERY bonded board, in PnP order, each once.

    A device that is paired AND connected to Windows stops advertising, so
    BleakScanner can't see it (the steady state once paired — see
    README-windows.md). WinRT can still connect to it directly by address, so
    we recover the addresses from the OS:

    1. CLAWDMETER_BLE_ADDRESS env override: exactly that one board (skips
       discovery, for testing or pinning).
    2. Windows PnP table, filtered to the board's FriendlyNames (DEVICE_NAMES).
       Windows can list one board more than once, so repeats are dropped.

    Non-Windows or any failure returns []. The result is also kept in _BONDED, which
    main() reads after acquire_target() instead of running the lookup a second time.
    """
    global _BONDED
    addresses: list[str] = []
    if override := os.environ.get("CLAWDMETER_BLE_ADDRESS"):
        pinned = override.strip().upper()
        if pinned:
            addresses.append(pinned)
    else:
        for line in _bonded_pnp_ids():
            mac = _mac_from_pnp_instance_id(line)
            if mac and mac not in addresses:
                addresses.append(mac)
    _BONDED = list(addresses)
    return addresses


def discover_bonded_address() -> str | None:
    """Return the BLE address of the first bonded board, or None (the single board lookup)."""
    addresses = discover_bonded_addresses()
    return addresses[0] if addresses else None


async def acquire_target():
    """Return a connectable handle for the Clawdmeter, or None.

    Targets only the device bonded to THIS machine (via the PnP table /
    CLAWDMETER_BLE_ADDRESS) — it never scans for a nearby device by name, so it
    can't grab a stranger's or the wrong nearby unit. The device must be paired
    with Windows once first (the documented setup). Returns a BLEDevice or None.
    """
    address = discover_bonded_address()
    if not address:
        return None
    log(f"Not advertising; connecting to bonded address {address}")
    # CRITICAL: hand BleakClient a BLEDevice, not the bare address string. WinRT's
    # connect() resolves a bare string via an advertisement scan (find_device_by_address)
    # — which always fails for a bonded device that has stopped advertising, the very
    # case we are handling. A BLEDevice sets _device_info directly, so WinRT connects
    # via from_bluetooth_address_with_bluetooth_address_type_async and skips the scan.
    return BLEDevice(address, DEVICE_NAME, None)


# The text a relay message gives up, from the end and least needed field first, when it
# is too long for the link. A usage payload has none: it always goes out whole.
_SHRINK_ORDER = (
    ("pg", ("p3", "p2", "p1", "pt")),   # a page
    ("nt", ("nb", "nt")),               # a notification
    ("q", ("qs", "qt")),                # an approve prompt
)


def _encode(payload: dict) -> bytes:
    """A message as it goes on the wire: compact JSON in raw UTF-8, which ArduinoJson reads
    as it is (the default ASCII mode spends 6 bytes on each character outside ASCII). A
    lone surrogate, which json.loads lets through, goes out as "?"."""
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8", "replace")


def _fit(payload: dict, limit: int) -> dict | None:
    """A relay message cut to at most `limit` bytes on the wire, or None.

    The fields in _SHRINK_ORDER give up characters from the end, one field after the
    other, until the message fits. None when that is not enough, or when the message
    has no such field.
    """
    fields = next((keys for kind, keys in _SHRINK_ORDER if kind in payload), ())
    fitted = dict(payload)
    for key in fields:
        text = fitted.get(key)
        if not isinstance(text, str):
            continue
        while text and len(_encode(fitted)) > limit:
            text = text[:-1]
            fitted[key] = text
        if len(_encode(fitted)) <= limit:
            return fitted
    return None


class Session:
    def __init__(self, client: BleakClient, address: str = "") -> None:
        self.client = client
        self.address = address  # the board's BLE address, stamped on its button events
        self.refresh_requested = asyncio.Event()
        self._last_write = -math.inf  # time.monotonic() of the previous write (WRITE_GAP)
        # One write at a time on this link, whichever task asks: relay_wifi writes to every
        # board from one link's task, while a board's own write may be under way.
        self._turn = asyncio.Lock()
        self._tx_ok = False  # TX notifies are subscribed: the board's answers can be heard
        # Album art (ART_CHAR_UUID), all of it per link: a board that links again starts afresh.
        self._art_ok: bool | None = None  # this link takes art; None until it is looked up
        self._art_last: str | None = None  # the newest art id a page took to this board
        self._art_want: str | None = None  # the id whose picture goes next, not started yet
        self._art_id: str | None = None  # the id whose picture is going out now
        self._art_answer: asyncio.Future | None = None  # resolved by the board's answer to it
        self._art_wake = asyncio.Event()  # set by every newer id, for a transfer waiting on an answer
        self._art_task: asyncio.Task | None = None  # this link's one transfer task

    def _on_refresh(self, _char, _data: bytearray) -> None:
        log("Refresh requested by device")
        self.refresh_requested.set()

    def _on_tx(self, _char, data: bytearray) -> None:
        """Notifies from the board. Acks are noise; {"approve": id} is an answer, {"btn",
        "scr"} a button press, which goes to events/ for the engine, and {"art": id, "ok"} or
        {"art": id, "miss"} the board's answer about a picture (_art_heard). Anything else
        is dropped."""
        try:
            msg = json.loads(bytes(data).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return
        if not isinstance(msg, dict):
            return
        if "btn" in msg:
            write_event(msg["btn"], msg.get("scr"), self.address)
            return
        if "art" in msg:
            self._art_heard(msg)
            return
        request_id = msg.get("approve")
        if request_id is None:
            return
        if not _approve_id_ok(request_id):
            log(f"Device sent an approve with a bad id, ignoring: {request_id!r}")
            return
        log(f"Device approved {request_id}")
        write_decision(request_id, "allow")

    async def setup_tx_subscription(self) -> None:
        # Optional like the refresh subscription: without it usage still flows,
        # only device answers to approve prompts go unheard.
        try:
            await self.client.start_notify(TX_CHAR_UUID, self._on_tx)
        except (BleakError, ValueError, OSError) as e:
            log(f"TX subscription unavailable (no approve answers): {e}")
            return
        self._tx_ok = True

    async def setup_refresh_subscription(self) -> None:
        # The refresh subscription is optional — the 60s poll loop works without it.
        # WinRT's start_notify() CCCD write can raise a raw OSError/WinError (not
        # wrapped as BleakError) when the peer GATT server is transiently unavailable,
        # e.g. a just-power-cycled ESP32 whose server is not yet ready (G-03-01, SC#3).
        # Degrade gracefully instead of crashing the daemon so it stays single-process
        # across a power-cycle reconnect (SC#4, no restart).
        try:
            await self.client.start_notify(REQ_CHAR_UUID, self._on_refresh)
        except (BleakError, ValueError, OSError) as e:
            log(f"Refresh subscription unavailable: {e}")

    def _wire_max(self) -> int | None:
        """The most bytes one write carries on this link, the negotiated ATT MTU less 3, or
        None while the link reports no MTU of its own (23 is the ATT default from before the
        exchange)."""
        try:
            mtu = self.client.mtu_size
        except (AssertionError, AttributeError, OSError, BleakError):
            return None   # bleak asserts a live session; WinRT can raise a raw OSError
        if isinstance(mtu, int) and not isinstance(mtu, bool) and mtu > 23:
            return mtu - 3
        return None

    def write_limit(self) -> int:
        """The most bytes one message may take on this link: the negotiated ATT MTU less
        3, never more than the board keeps, and WIRE_MAX_ASSUMED while the link reports
        no MTU of its own (23 is the ATT default from before the exchange)."""
        wire = self._wire_max()
        return WIRE_MAX_ASSUMED if wire is None else min(wire, WIRE_MAX_BOARD)

    def art_chunk_size(self) -> int:
        """The bytes of picture in one chunk on this link: one write's worth (the negotiated
        ATT MTU less 3, never more than ART_CHUNK_MAX) less the 2 bytes of the chunk's number,
        so the MTU less 5 and at most 510; 251 at the MTU of 256 the boards ask for, which is
        also what goes while the link reports no MTU of its own."""
        wire = self._wire_max()
        return (WIRE_MAX_ASSUMED if wire is None else min(wire, ART_CHUNK_MAX)) - 2

    async def write_payload(self, payload: dict, quiet: bool = False, secret: bool = False) -> bool:
        """Write one message to the board. quiet leaves out the "Sending:" log line.

        A page, notification or prompt too long for the link is cut to fit (_fit), or
        not sent at all (False, after a log line) when cutting is not enough. A usage
        payload always goes out whole.

        secret (Wi-Fi credentials): nothing of the message reaches the log, and a failed
        write logs only the kind of error, because bleak's WinRT error quotes the bytes it
        could not write. A secret is never cut: one too long for the link is not sent.
        """
        async with self._turn:
            data = _encode(payload)
            limit = self.write_limit()
            if len(data) > limit and secret:
                log(f"A secret message does not fit the link ({limit}), not sent")
                return False
            if len(data) > limit and any(kind in payload for kind, _ in _SHRINK_ORDER):
                fitted = _fit(payload, limit)
                if fitted is None:
                    log(f"Message of {len(data)} bytes does not fit the link ({limit}), not sent:"
                        f" {data[:48].decode('utf-8', 'ignore')}")
                    return False
                cut = _encode(fitted)
                if not quiet:
                    log(f"Message of {len(data)} bytes cut to {len(cut)} to fit the link ({limit})")
                data = cut
            # One message at a time: the board keeps a single incoming message until its
            # loop reads it, so a burst waits WRITE_GAP between writes (see WRITE_GAP).
            wait = self._last_write + WRITE_GAP - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            if not (quiet or secret):
                log(f"Sending: {data.decode()}")
            try:
                await self.client.write_gatt_char(RX_CHAR_UUID, data, response=False)
                return True
            except (BleakError, OSError) as e:
                # WinRT can raise a raw OSError/WinError (NOT wrapped as BleakError)
                # when the peer GATT server goes transiently unavailable mid-write —
                # the same failure class setup_refresh_subscription() guards against.
                # Returning False trips the zombie-link break -> clean reconnect,
                # rather than an uncaught exception killing the daemon thread (the
                # silent-freeze failure mode, SC#2 field report).
                log(f"Write failed: {type(e).__name__}" if secret else f"Write failed: {e}")
                return False
            finally:
                self._last_write = time.monotonic()

    # Album art (ART_CHAR_UUID): one transfer task per link, never in the tick loop's way.

    def page_art(self, pi) -> None:
        """A page message carrying art id `pi` (None when it has none) just went to this board.

        An id new on this link has its picture streamed by this link's transfer task, one
        picture at a time: the newer id drops a picture still waiting for its turn, and the
        one going out stops before its next chunk (_art_send). Only the ids of the "pi" rule
        (ART_ID) count, and a link that takes no art (_art_channel) is left alone.
        """
        if not (isinstance(pi, str) and ART_ID.fullmatch(pi)) or pi == self._art_last:
            return
        self._art_last = pi
        self._art_wake.set()
        if not self._art_channel():
            return
        # The picture going out right now (the page went to another id and straight back) goes on.
        self._art_want = None if pi == self._art_id else pi
        if self._art_want and (self._art_task is None or self._art_task.done()):
            self._art_task = asyncio.ensure_future(self._art_run())   # the board's log tag goes along

    def _art_channel(self) -> bool:
        """Whether this link takes album art, looked up once: the board's service table has
        the art characteristic (older firmware has none), and its answers come in on TX. A
        link that takes none says so in one log line and is left alone from then on."""
        if self._art_ok is None:
            try:
                services = self.client.services   # bleak raises before service discovery
                found = (services.get_characteristic(ART_CHAR_UUID)
                         if isinstance(services, BleakGATTServiceCollection) else None)
            except (BleakError, AssertionError, AttributeError, OSError):
                found = None
            self._art_ok = found is not None and self._tx_ok
            if found is None:
                log("Board has no album art characteristic (older firmware), no art on this link")
            elif not self._tx_ok:
                log("No TX answers on this link, so no album art on it")
        return self._art_ok

    def _art_heard(self, msg: dict) -> None:
        """The board's answer about a picture: {"art": id, "ok": 1} or {"art": id, "miss": [...]}.
        It resolves the answer future of the transfer of that id; an answer for any other id
        (a late one), one with neither, or one with no transfer waiting is dropped."""
        answer = self._art_answer
        if answer is None or answer.done() or msg.get("art") != self._art_id:
            return
        if msg.get("ok") == 1 or isinstance(msg.get("miss"), list):
            answer.set_result(msg)

    async def _art_run(self) -> None:
        """This link's transfer task: the picture wanted most recently, one at a time, until
        none is left. Anything unexpected ends that picture with a log line, never the link."""
        while self._art_want:
            pi, self._art_want = self._art_want, None
            try:
                await self._art_send(pi)
            except Exception as e:
                log(f"Art {pi}: {type(e).__name__}: {e}, given up")

    async def _art_send(self, pi: str) -> None:
        """Stream the picture for `pi` to this board and log one line on how it went: shown,
        already on the board (the board answered the header itself, so no chunk went), given
        up, stopped with the link, or left for a newer picture; each with the picture's bytes
        and chunks, the chunk writes it took (the resent ones among them) and the milliseconds.
        The header goes the way every message goes (write_payload), so it keeps WRITE_GAP from
        the page before it. Each chunk takes its turn on the link like a message,
        ART_CHUNK_GAP apart, so the tick loop's messages and the other boards' links go in
        between; a chunk does not count toward WRITE_GAP, since it lands in the board's
        picture buffer and not in the one message the board holds."""
        data = _read_art(pi)
        if data is None:
            return
        size = self.art_chunk_size()   # the same in every round: the board puts chunk k at k * size
        chunks = [k.to_bytes(2, "little") + data[i:i + size]
                  for k, i in enumerate(range(0, len(data), size))]
        loop = asyncio.get_running_loop()
        self._art_id = pi
        # Each round's answer future is there before the round's first write, so an early
        # answer (an ok for a picture the board shows already, say) is not missed.
        self._art_answer = answer = loop.create_future()
        started = time.monotonic()
        writes = resent = 0

        def end(outcome: str) -> None:
            """The picture's one log line: `outcome`, then what went and how long it took."""
            ms = round((time.monotonic() - started) * 1000)
            again = f" ({resent} resent)" if resent else ""
            log(f"Art {pi} {outcome}: {len(data)} bytes in {len(chunks)} chunks,"
                f" {writes} writes{again}, {ms} ms")

        try:
            if not await self.write_payload({"ab": pi, "al": len(data), "an": len(chunks)}, quiet=True):
                end("given up, the header was not written")
                return
            # The board reads the header in its loop like any message (WRITE_GAP), while a chunk
            # lands in its picture buffer as it comes: chunk 0 waits until the header is read.
            await asyncio.sleep(max(0.0, self._last_write + WRITE_GAP - time.monotonic()))
            todo = list(range(len(chunks)))
            for round_ in range(ART_RESEND_ROUNDS + 1):
                for n, k in enumerate(todo):
                    if n:
                        await asyncio.sleep(ART_CHUNK_GAP)
                    if answer.done():
                        break                        # answered mid round: see what the board says
                    async with self._turn:
                        if self._art_last != pi:     # a newer id came while this chunk waited
                            end("left for a newer picture")
                            return
                        try:
                            await self.client.write_gatt_char(ART_CHAR_UUID, chunks[k], response=False)
                        except (BleakError, OSError, AssertionError) as e:
                            end(f"given up, chunk {k} not written ({type(e).__name__}: {e})")
                            return
                    writes += 1
                    resent += bool(round_)
                reply = await self._art_reply(pi, answer)
                if reply is None:
                    if self._art_last != pi:
                        end("left for a newer picture")
                    else:
                        end(f"given up, no answer from the board in {ART_ANSWER_WAIT:g} s")
                    return
                if reply.get("ok") == 1:
                    # With no chunk written the ok answered the header: the board had this picture.
                    end("shown" if writes else "already on the board (it answered the header)")
                    return
                todo = _art_missing(reply.get("miss"), len(chunks))
                if round_ == ART_RESEND_ROUNDS:
                    end(f"given up, {len(todo)} of {len(chunks)} chunks still missing after"
                        f" {ART_RESEND_ROUNDS} resends")
                    return
                self._art_answer = answer = loop.create_future()
        except asyncio.CancelledError:   # stop_art: the link is going
            end("stopped, the link ended")
            raise
        finally:
            self._art_id = None
            self._art_answer = None

    async def _art_reply(self, pi: str, answer: asyncio.Future) -> dict | None:
        """The board's answer to the chunks just written, or None after ART_ANSWER_WAIT seconds
        without one, or as soon as a newer id takes this link (page_art sets _art_wake)."""
        deadline = time.monotonic() + ART_ANSWER_WAIT
        while not answer.done() and self._art_last == pi:
            left = deadline - time.monotonic()
            if left <= 0:
                break
            self._art_wake.clear()
            wake = asyncio.ensure_future(self._art_wake.wait())
            try:
                await asyncio.wait((answer, wake), timeout=left, return_when=asyncio.FIRST_COMPLETED)
            finally:
                wake.cancel()
                await asyncio.gather(wake, return_exceptions=True)
        return answer.result() if answer.done() else None

    async def stop_art(self) -> None:
        """End this link's transfer, if one runs: the link is going, and nothing more is
        written on it."""
        self._art_want = None
        task, self._art_task = self._art_task, None
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


def _extract_access_token(blob: str) -> str | None:
    """Pull the accessToken out of a credentials blob.

    Claude Code stores credentials as a JSON object; the blob may also be
    nested ({"claudeAiOauth": {"accessToken": "..."}}). Fall back to a
    regex match so unexpected shapes still work, and finally treat the
    blob as a raw token if nothing else matches.
    """
    blob = blob.strip()
    if not blob:
        return None
    try:
        data = json.loads(blob)
    except json.JSONDecodeError:
        data = None
    if isinstance(data, dict):
        # direct: {"accessToken": "..."}
        tok = data.get("accessToken")
        if isinstance(tok, str) and tok.strip():
            return tok
        # nested: {"claudeAiOauth": {"accessToken": "..."}}
        for v in data.values():
            if isinstance(v, dict):
                tok = v.get("accessToken")
                if isinstance(tok, str) and tok.strip():
                    return tok
    m = re.search(r'"accessToken"\s*:\s*"([^"]+)"', blob)
    if m:
        return m.group(1)
    # Raw token (no JSON wrapper) — must look plausible (sk-ant-... etc.)
    if re.fullmatch(r"[A-Za-z0-9_\-.~+/=]{20,}", blob):
        return blob
    return None


def _windows_credential_candidates() -> list[Path]:
    """Return the ordered list of credential file paths to probe (first hit wins).

    Priority:
    1. CLAUDE_CREDENTIALS_PATH env override (D-03, project-specific)
    2. CLAUDE_CONFIG_DIR env override (official Claude override)
    3. D-02 candidate list: home/.claude, LOCALAPPDATA/Claude, APPDATA/Claude
    """
    # Priority 1: project-specific env override (D-03)
    if override := os.environ.get("CLAUDE_CREDENTIALS_PATH"):
        return [Path(override)]
    # Priority 2: official CLAUDE_CONFIG_DIR env override
    if config_dir := os.environ.get("CLAUDE_CONFIG_DIR"):
        return [Path(config_dir) / ".credentials.json"]
    # Priority 3: D-02 candidate list — first hit wins
    home = Path.home()
    local_appdata = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
    appdata = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
    return [
        home / ".claude" / ".credentials.json",          # primary (confirmed by docs)
        local_appdata / "Claude" / ".credentials.json",  # fallback 2
        appdata / "Claude" / ".credentials.json",        # fallback 3
    ]


def read_token() -> str | None:
    """Read the Claude OAuth access token from the first available credential file."""
    for path in _windows_credential_candidates():
        try:
            return _extract_access_token(path.read_text(encoding="utf-8"))
        except OSError:
            continue
    return None


def _read_expiry() -> str:
    """Return human-readable expiry from the first-hit credentials file.

    Reads claudeAiOauth.expiresAt (epoch milliseconds — JS convention).
    Divides by 1000 before passing to fromtimestamp (Python expects seconds).
    Returns 'expiry unknown' on any parse failure.
    """
    for path in _windows_credential_candidates():
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            continue
        try:
            data = json.loads(raw)
            oauth = data.get("claudeAiOauth", {})
            expires_ms = oauth.get("expiresAt")
            if expires_ms is None:
                return "expiry unknown"
            # CRITICAL: expiresAt is JS-convention epoch milliseconds; divide by 1000
            # before fromtimestamp (Python expects seconds). Raw value -> year ~57000.
            dt = datetime.datetime.fromtimestamp(
                expires_ms / 1000, tz=datetime.timezone.utc
            )
            return dt.strftime("%Y-%m-%d %H:%M UTC")
        except (TypeError, ValueError, OSError, AttributeError, json.JSONDecodeError):
            return "expiry unknown"
    return "expiry unknown"


async def _wait_first(*events: asyncio.Event, timeout: float) -> None:
    """Return when any of `events` is set, or after `timeout` seconds.

    Lets the poll loop's TICK wait wake immediately on a stop signal (clean,
    responsive Quit) without losing the refresh-request wakeup — instead of
    waiting only on refresh_requested and re-checking stop_event up to TICK
    later. Cancels and drains the loser tasks so they don't warn.
    """
    tasks = [asyncio.ensure_future(e.wait()) for e in events]
    try:
        await asyncio.wait(tasks, timeout=timeout, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


# The sessions whose board link is up right now. With several boards the heartbeat
# says "connected" and the tray stays Connected while ANY of them is linked.
_LIVE_LINKS: set = set()
_WIFI_BUSY = False   # one link is sending the Wi-Fi file to every board right now
_WIFI_SENT = None    # the stamp of a Wi-Fi file already sent whose removal failed: never sent again
_WIFI_UNREAD = None  # the stamp of a Wi-Fi file found unreadable, logged once and read again each tick


async def relay_wifi(seen):
    """One link's turn at the Wi-Fi file; returns the file version this link has now dealt with.

    `seen` is the version it dealt with before (_FIRST_TICK on its first tick, so a file
    that waited for a board goes out as soon as one links). A new version goes out ONCE,
    as its own message, to every board linked right now, from whichever link comes to it
    first; the others see it busy and look again next tick. The file is removed as soon
    as one board took the write. When none did, it waits for the next link. A file that
    cannot be read right now is not dealt with: the link reads it again next tick, and
    that is logged once for the version, not on every tick. The credentials live in this
    call only, and no log line carries any of them.
    """
    global _WIFI_BUSY, _WIFI_SENT, _WIFI_UNREAD
    stamp = wifi_stamp()
    if stamp is None:
        return None
    if stamp == _WIFI_SENT:                  # sent already; only its removal is still owed
        if _drop_wifi_file(stamp) is None:
            log("Wi-Fi file removed")
        return stamp
    if stamp == seen or _WIFI_BUSY:
        return seen
    _WIFI_BUSY = True
    try:
        try:
            msg = read_wifi_msg()
        except OSError as e:                 # held open by another program for a moment, say
            if stamp != _WIFI_UNREAD:
                _WIFI_UNREAD = stamp
                log(f"Wi-Fi file unreadable, will try again: {e.strerror or type(e).__name__}")
            return seen                      # not dealt with: this link reads it again next tick
        _WIFI_UNREAD = None
        if msg is None:
            return stamp                     # malformed and logged: waits for a new version
        forget = not msg["wf"]
        took = 0
        for session in list(_LIVE_LINKS):
            # Each board's own lines carry its own tag, though this runs in another link's task.
            tag = _LOG_TAG.set(f"[{session.address}] ") if _LOG_TAG.get() else None
            try:
                took += await session.write_payload(msg, secret=True)
            except Exception as e:           # another board's trouble must not end this link
                log(f"Write failed: {type(e).__name__}")
            finally:
                if tag is not None:
                    _LOG_TAG.reset(tag)
        del msg
        if not took:
            log("Wi-Fi credentials reached no board, the file waits for the next link")
            return stamp
        error = _drop_wifi_file(stamp)
        note = " (empty ssid: the boards forget the network)" if forget else ""
        if error is None:
            log(f"Wi-Fi credentials sent to {took} board(s), file removed{note}")
        else:
            _WIFI_SENT = stamp
            log(f"Wi-Fi credentials sent to {took} board(s), file not removed yet{note}: {error}")
        return stamp
    finally:
        _WIFI_BUSY = False


async def connect_and_run(device, stop_event: asyncio.Event, tray_state=None,
                          connect_turn: asyncio.Lock | None = None) -> bool:
    """Connect to device and poll until disconnected or stopped.

    Returns True if at least one successful write occurred.

    `device` is a BLEDevice — either from an advertisement scan or built from the
    bonded address by acquire_target(). The getattr keeps the log line robust if a
    bare address string is ever passed in.

    `connect_turn` (several boards only): a lock the boards' connects take turns on,
    held just while one connect is being established. None with a single board.
    """
    log(f"Connecting to {getattr(device, 'address', device)}...")
    # D-01: retry wrapper — defeats WinRT post-wake failure modes
    # (Could not get GATT services: Unreachable, stale is_connected).
    # Rebuild a fresh BleakClient each attempt (locked D-05 recipe).
    client = None
    for attempt in range(CONNECT_RETRIES):
        # D-05: pass BLEDevice (not address string), address_type="random" (NimBLE
        # static-random), use_cached_services=False (DIY firmware — WinRT GATT cache
        # may be stale after firmware reflash).
        client = BleakClient(
            device,
            address_type="random",
            use_cached_services=False,
        )
        try:
            async with connect_turn or contextlib.nullcontext():
                await client.connect()
        except (BleakError, OSError, asyncio.TimeoutError, AssertionError) as e:
            # WinRT service discovery inside connect() can surface a raw OSError
            # (WinError) or even a bare AssertionError from bleak's FutureLike
            # (assert self._result) when the peer drops the link mid-discovery —
            # neither is wrapped as BleakError. Treat them as a normal failed
            # attempt so the D-01 retry loop handles them, instead of letting an
            # uncaught exception kill the daemon thread (the "daemon crashed"
            # tray toast + silent polling stop, field report).
            log(f"Connection attempt {attempt + 1}/{CONNECT_RETRIES} failed: {type(e).__name__}: {e}")
            try:
                await client.disconnect()
            except BleakError:
                pass
            if attempt < CONNECT_RETRIES - 1:
                await asyncio.sleep(CONNECT_RETRY_DELAY)
            continue

        if not client.is_connected:
            log(f"Connection attempt {attempt + 1}/{CONNECT_RETRIES} failed (not connected)")
            try:
                await client.disconnect()
            except BleakError:
                pass
            if attempt < CONNECT_RETRIES - 1:
                await asyncio.sleep(CONNECT_RETRY_DELAY)
            continue

        # Connected successfully
        break
    else:
        log(f"Connection failed after {CONNECT_RETRIES} attempts")
        return False

    log("Connected")
    address = getattr(device, "address", device)
    address = address if isinstance(address, str) else ""
    session = Session(client, address)
    await session.setup_refresh_subscription()
    await session.setup_tx_subscription()

    last_poll = 0.0  # D-03: poll immediately on first connect
    used_successfully = False
    consecutive_failures = 0  # D-03: zombie-link break counter
    last_state = None  # state file stamp as of the previous tick
    state_fields: dict = {}  # last good "n"/"a" fields, merged into every payload
    last_usage: dict | None = None  # the last polled usage payload, without the state fields
    last_approve = approve_stamp()  # a request left over from before this link is stale, not ours to show
    # A notification from before this link is old news too, like a leftover prompt.
    last_notify = notify_stamp()
    # A page is current state instead: the first tick reads page.json even when there is
    # none and brings the board in line with it. page_sent is the page message this board
    # has, so the same page is never sent twice. A board the daemon last sent a live page
    # to (the record outlives the link and the tray) may still show it, so it starts at
    # None and gets whatever page.json says, a clear included. A board never sent a page
    # shows none: with no page.json it is sent nothing at all.
    last_page = _FIRST_TICK
    page_sent: dict | None = None if address in _paged() else {"pg": ""}
    page_until = 0.0  # when that page lapses: the board keeps no timer for a page, so we clear it
    last_wifi = _FIRST_TICK  # Wi-Fi credentials wait for a board: the first tick sends any waiting
    try:
        _LIVE_LINKS.add(session)
        while client.is_connected and not stop_event.is_set():
            write_heartbeat(True)
            # Host state changed (agents / animation): push now instead of waiting
            # out the 60s poll. With a fresh usage payload in hand, resend it with
            # the new fields and no API call (the creature hooks change the state
            # on every tool call); otherwise poll, like a device refresh request.
            stamp = state_stamp()
            if stamp != last_state:
                last_state = stamp
                fields = read_state_fields()
                if fields is not None:  # None = malformed; keep the last good state
                    state_fields = fields
                    log(f"State file changed: {state_fields or 'absent'}")
                    if last_usage is not None and time.time() - last_poll < POLL_INTERVAL:
                        cached = dict(last_usage)
                        add_clock_fields(cached)
                        cached.update(state_fields)
                        await session.write_payload(cached)
                    else:
                        session.refresh_requested.set()
            # A permission prompt to relay (or its clear): straight to the
            # device as its own message. No API call in the way, and no merge
            # into the usage payload, which a prompt must never wait on.
            stamp = approve_stamp()
            if stamp != last_approve:
                last_approve = stamp
                msg = read_approve_msg()
                if msg is not None:
                    log(f"Approve file changed: {msg}")
                    await session.write_payload(msg)
            # A notification (or its clear): its own message at once, like a prompt.
            stamp = notify_stamp()
            if stamp != last_notify:
                last_notify = stamp
                msg = read_notify_msg()
                if msg is not None:
                    log(f"Notify file changed: {msg}")
                    await session.write_payload(msg)
            # The page, when it differs from what this board has. A move of the
            # progress bar alone goes out without log lines, which would otherwise
            # flood daemon.log for as long as a track plays.
            stamp = page_stamp()
            if stamp != last_page:
                last_page = stamp
                page = read_page_msg()
                if page is not None:
                    msg, page_until = page
                    if msg != page_sent:
                        progress_only = (page_sent is not None
                                         and _page_sans_progress(msg) == _page_sans_progress(page_sent))
                        if not progress_only:
                            log(f"Page file changed: {msg}")
                        if await session.write_payload(msg, quiet=progress_only):
                            page_sent = msg
                            _note_page(address, bool(msg["pg"]))
                            # An art id new on this link: its picture follows from the link's
                            # own transfer task, so this loop never waits on it.
                            session.page_art(msg.get("pi"))
            if page_until and time.time() >= page_until:
                page_until = 0.0
                log("Page expired, clearing it")
                if await session.write_payload({"pg": ""}):
                    page_sent = {"pg": ""}
                    _note_page(address, False)
            # Wi-Fi credentials: once to every linked board, then the file goes.
            last_wifi = await relay_wifi(last_wifi)
            now = time.time()
            elapsed = now - last_poll
            if session.refresh_requested.is_set() or elapsed >= POLL_INTERVAL:
                session.refresh_requested.clear()
                token = read_token()  # D-09: fresh each cycle
                if not token:
                    log("No token; skipping poll")
                    if tray_state:
                        tray_state.set_error("token expired — run claude login")
                else:
                    try:
                        payload = await poll_api(token)
                    except AuthError:
                        # Real 401/403 — token genuinely needs a refresh.
                        if tray_state:
                            tray_state.set_error("token expired — run claude login")
                        payload = None
                    if payload is not None:
                        last_usage = dict(payload)
                        payload.update(state_fields)
                        if await session.write_payload(payload):
                            last_poll = time.time()
                            used_successfully = True
                            consecutive_failures = 0  # D-03: reset on success
                            if tray_state:
                                tray_state.set_connected(time.time())
                        else:
                            consecutive_failures += 1
                            if consecutive_failures >= ZOMBIE_BREAK_LIMIT:
                                log(
                                    f"Zombie link detected ({consecutive_failures} consecutive"
                                    f" write failures); abandoning connection"
                                )
                                break
                    # else: payload is None from a TRANSIENT failure (network/DNS,
                    # timeout, rate-limit, 5xx). poll_api already logged it; do NOT
                    # toast "token expired" — that mislabeled a boot-time DNS blip
                    # as an auth problem (SC#5). Leave tray state unchanged; the next
                    # tick retries and set_connected() recovers it.

            # Wake on a refresh request OR a stop, whichever comes first. Waking
            # promptly on stop_event is what lets the finally below run
            # client.disconnect() before the process exits, so the peer gets a
            # clean GATT disconnect (returns to its waiting screen) instead of
            # being left frozen on stale data after Quit (SC#3 graceful shutdown).
            await _wait_first(session.refresh_requested, stop_event, timeout=min(TICK, WATCH_TICK))
    finally:
        _LIVE_LINKS.discard(session)
        write_heartbeat(bool(_LIVE_LINKS))  # False unless another board is still linked
        try:
            await session.stop_art()  # a picture going out stops before the link does
        finally:
            # Clean GATT disconnect on the way out — this is what tells the peripheral
            # the link is gone. WinRT can surface a raw OSError (not BleakError) here,
            # so swallow both; the link tears down regardless once we exit.
            try:
                await client.disconnect()
            except (BleakError, OSError, AssertionError):
                # bleak's WinRT disconnect() also has bare asserts (e.g. assert char
                # while tearing down notifications on an already-gone peer); swallow
                # it too — the link tears down regardless once we exit.
                pass

    log("Device disconnected" if not stop_event.is_set() else "Stopping")
    return used_successfully


def _next_backoff(current: int, cap: int) -> int:
    """D-05: double current backoff value, clamped to cap.

    Pure helper — unit-testable without driving the main loop.
    Used by both slow-search (cap=60) and fast-reconnect (cap=RECONNECT_BACKOFF_CAP) regimes.
    """
    return min(current * 2, cap)


async def _board_link(address: str, stop_event: asyncio.Event, tray_state,
                      connect_turn: asyncio.Lock) -> None:
    """Keep one of several bonded boards linked until stop.

    The same connect_and_run a single board gets, pinned to this address, with its
    own fast-reconnect backoff (D-05), so one board dropping never holds up another.
    """
    _LOG_TAG.set(f"[{address}] ")  # this task's context only: the other boards keep theirs
    reconnect_backoff = 1
    while not stop_event.is_set():
        device = BLEDevice(address, DEVICE_NAME, None)
        if await connect_and_run(device, stop_event, tray_state, connect_turn):
            reconnect_backoff = 1
            continue
        if stop_event.is_set():
            break
        if tray_state and not _LIVE_LINKS:  # another board still linked keeps the tray Connected
            tray_state.set_scanning()
        log(f"Connection lost, reconnecting in {reconnect_backoff}s...")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=reconnect_backoff)
        except asyncio.TimeoutError:
            pass
        reconnect_backoff = _next_backoff(reconnect_backoff, RECONNECT_BACKOFF_CAP)


async def _run_boards(addresses: list[str], stop_event: asyncio.Event, tray_state) -> None:
    """Link every bonded board at once: one _board_link per address, gathered.

    Each link sends every message to its own board, so the boards mirror one another
    (usage, state, prompts, notifications, pages), and approve answers and button
    presses are taken from any of them. Connects take turns on one lock so two links
    are never being established at the same moment; it is made here, per run of the
    loop, because an asyncio.Lock belongs to one event loop and the tray starts a new
    loop after a crash.
    """
    log(f"{len(addresses)} bonded boards, linking all: {', '.join(addresses)}")
    connect_turn = asyncio.Lock()
    await asyncio.gather(*(_board_link(a, stop_event, tray_state, connect_turn) for a in addresses))


async def main(tray_state=None) -> None:
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    # Populate the shared state object so the tray can route Quit through
    # loop.call_soon_threadsafe (RESEARCH Pitfall 2).  Additive — the existing
    # stop_event = asyncio.Event() line above is unchanged.
    if tray_state is not None:
        tray_state.loop = loop
        tray_state.stop_event = stop_event

    def _stop(*_args: object) -> None:
        log("Daemon stopping")
        stop_event.set()

    # OS signal handlers can only be installed from the main thread, and
    # loop.add_signal_handler is unsupported on Windows. When running under the
    # tray (04-03) the loop lives in a background thread and the tray owns clean
    # shutdown via stop_event (loop.call_soon_threadsafe), so skip silently there.
    if threading.current_thread() is threading.main_thread():
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _stop)
            except NotImplementedError:
                # Windows: add_signal_handler not supported; fall back to signal.signal
                try:
                    signal.signal(sig, _stop)
                except ValueError:
                    # Not the main thread of the main interpreter — tray owns shutdown.
                    pass

    log("=== Claude Usage Tracker Daemon (BLE, Windows) ===")
    log(f"Poll interval: {POLL_INTERVAL}s")

    # D-05: two distinct backoff regimes — slow-search (device absent) vs fast-reconnect (link dropped)
    search_backoff = 1     # caps at 60s — gentle, for a device that is genuinely absent/off
    reconnect_backoff = 1  # caps at RECONNECT_BACKOFF_CAP — fast, to clear the 120s SLA after a drop
    while not stop_event.is_set():
        device = await acquire_target()
        if not device:
            # Slow-search regime: device was not found by scan — back off gently
            write_heartbeat(False)
            if tray_state:
                tray_state.set_scanning()
            log(f"Device not found, retrying in {search_backoff}s...")
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=search_backoff)
            except asyncio.TimeoutError:
                pass
            search_backoff = _next_backoff(search_backoff, 60)
            continue

        # More than one board bonded: link every one of them, until stop. The bond list
        # is the one acquire_target() just looked up, so each round runs PowerShell once.
        addresses = list(_BONDED)
        if len(addresses) > 1:
            await _run_boards(addresses, stop_event, tray_state)
            continue

        ok = await connect_and_run(device, stop_event, tray_state)
        if not ok:
            # Fast-reconnect regime: had/attempted a link that dropped — retry quickly
            if tray_state:
                tray_state.set_scanning()
            log(f"Connection lost, reconnecting in {reconnect_backoff}s...")
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=reconnect_backoff)
            except asyncio.TimeoutError:
                pass
            reconnect_backoff = _next_backoff(reconnect_backoff, RECONNECT_BACKOFF_CAP)
        else:
            # Successful session — reset reconnect counter to floor; search_backoff also reset
            reconnect_backoff = 1
            search_backoff = 1


if __name__ == "__main__":
    if sys.platform != "win32":
        print(
            "Warning: running under Linux/WSL — WinRT BLE will not be available.",
            file=sys.stderr,
        )
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
