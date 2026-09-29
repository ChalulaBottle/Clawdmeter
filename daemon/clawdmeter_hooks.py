#!/usr/bin/env python3
"""Claude Code hooks that make the Clawdmeter creature follow what Claude is doing.

    python -E -S daemon/clawdmeter_hooks.py <Event>     stdin: the hook's JSON
    python daemon/clawdmeter_hooks.py --print-settings   the hooks block to paste

Claude Code runs this on its lifecycle events. Each run picks a creature for the
moment and writes it to %LOCALAPPDATA%\\Clawdmeter\\state.json, with the same
checks as clawdmeter_state.load and the same atomic replace as
clawdmeter_state.save (the tests hold the two together); the daemon pushes it to
the device within about a second. Not installed by this file: the print settings
option prints the block for settings.json (absolute paths of this machine) and
writes nothing.

House rules: stdlib only, no network, prints nothing, always exits 0 (a failing
hook must never change what Claude Code does), writes atomically and only when
something changed, never touches a settings file. Runs on every tool call, so it
imports only what is built into the interpreter or frozen (os, sys, time, _json,
msvcrt). Not json (it brings re, enum, functools and collections), not pathlib,
not clawdmeter_state (json and pathlib again): together about 50 ms on every run
on the development machine, against about 2 ms for this list. JSON goes through
_json, the C scanner and encoder the json package itself sits on; anything that
is not plain UTF 8 falls back to the json package. The tests check the list.

Event                 creature ("" hands the choice back to the device)
SessionStart          token burner, else ctf hoodie, else the model tier, else "";
                      this session's agents reset. Source "compact" (can be mid
                      turn) leaves agents and creature alone and only takes down
                      the loading bar of a compaction typed by hand
UserPromptSubmit      token burner, else ctf hoodie, else the model tier, else
                      "echo think spin"
PreToolUse            Edit Write MultiEdit NotebookEdit: "echo write"
                      Read Glob Grep: "echo read"
                      Bash PowerShell: "echo work"; "echo ssh" when the command
                      runs ssh, scp or sftp
                      WebFetch WebSearch: "echo consult"; Skill: "echo loading"
                      Agent Task: "two agents" ("ultracode work" from 3 agents up)
                      Workflow: "ultracode enter", then "ultracode work" on every
                      later tool call while its agents run (mode word "ultracode")
                      anything else: "echo work"
                      inside a subagent (agent_id set): the agents creature
                      the first call after the token reading crosses 500k:
                      "token burner"
PostToolUse           nothing of its own (wired for Agent and Task only)
SubagentStart, Stop   count running subagents (the N AGENTS badge); "agents join"
                      when the last one finishes
Stop                  "job done" plus mode word "done"; the next event of any kind
                      clears it. Not while this session still has agents running,
                      nor right after launching a workflow whose agents are not up yet
Notification          idle_prompt: back to the device's choice (also covers Esc,
                      which fires no Stop). Permission prompts: nothing (they
                      belong to the approve hook)
PreCompact            "echo loading"
PostModelSwitch       remembers the model tier for the next prompt
SessionEnd            this session's agents gone, hook mode words dropped, ""

Subagents are counted from SubagentStart and SubagentStop only, keyed by
agent_id. The Agent tool's PreToolUse and PostToolUse would count a background
agent as finished the moment it launches, and a Workflow's agents never pass
through that tool.

Order: hooks run as separate processes, so a run held up behind others can
arrive after a newer event. Each run takes its time before it waits for the
lock, and that time orders it. A SubagentStart or a subagent's tool call older
than that agent's SubagentStop does not bring it back (a newer one does:
SendMessage can wake a finished agent under the same id), and a run older than
the last creature change keeps its bookkeeping but shows nothing and does not
clear "job done".

The model tier ("model haiku", "model sonnet", "model opus", "model fable") comes
from PostModelSwitch to_model, else the SessionStart model field, else the newest
assistant message in the transcript tail, and is cached in hooks.json. Token
burner: the newest request's input, cache creation, cache read and output tokens
added up (read from the transcript tail, since no hook payload carries usage)
above 500000, held for 60 s after the last reading above; SessionStart's
context_tokens counts too. CTF: a folder name in cwd that starts with ctf or htb,
or ends in ctf (so h7ctf and picoCTF are, ProjectFiles is not), hackthebox or
holmes anywhere in cwd, or the mode word "ctf" set by hand.

Files, all under %LOCALAPPDATA%\\Clawdmeter:
    state.json   {"agents", "anim", "mode"}; the daemon reads it. The hooks own
                 the mode words "ultracode" and "done"; other words (such as
                 "ctf", set by hand) stay.
    hooks.json   the hooks' own bookkeeping, never read by the daemon: running
                 subagents per session, recently finished ones, the model tier,
                 the token reading, when the creature last changed. Kept out of
                 state.json because every state.json change costs the daemon one
                 usage poll.
    hooks.lock   serialises concurrent runs (parallel tool calls, agents that
                 start together). A run waits up to LOCK_WAIT_S for it: all but
                 SessionEnd run in the background, so the wait holds up nothing,
                 and a SubagentStart or SubagentStop that gave up would miscount.

Because each state.json change costs the daemon a poll, a tool call in the first
DWELL_S of the current creature leaves it on screen (it is skipped, not queued:
with no process between events, the next call after DWELL_S brings its own);
moments (prompt, stop, agents, workflow, compaction, session start and end)
always go through at once.
"""

import os
import sys
import time

try:  # built in or frozen, all of it: nothing here reads a file
    if os.name == "nt":
        import msvcrt
    else:
        import fcntl
    try:
        from _json import encode_basestring_ascii as _c_str
        from _json import make_encoder as _c_encoder
        from _json import make_scanner as _c_scanner
    except ImportError:  # a Python without the C accelerator: the json package does it all
        _c_scanner = None
except BaseException:  # noqa: BLE001 - run by Claude Code: print nothing, exit 0
    if __name__ != "__main__":
        raise
    sys.exit(0)

# Every name this script can send. All exist in firmware/src/splash_animations.h
# and fit its char[24] (the tests check both).
THINK = "echo think spin"
WRITE = "echo write"
READ = "echo read"
WORK = "echo work"
SSH = "echo ssh"
CONSULT = "echo consult"
LOADING = "echo loading"
TWO_AGENTS = "two agents"
AGENTS_JOIN = "agents join"
ULTRA_ENTER = "ultracode enter"
ULTRA_WORK = "ultracode work"
JOB_DONE = "job done"
BURNER = "token burner"
CTF = "ctf hoodie"
MODEL_TIERS = (("haiku", "model haiku"), ("sonnet", "model sonnet"),
               ("opus", "model opus"), ("fable", "model fable"))
ANIMS = frozenset({THINK, WRITE, READ, WORK, SSH, CONSULT, LOADING, TWO_AGENTS, AGENTS_JOIN,
                   ULTRA_ENTER, ULTRA_WORK, JOB_DONE, BURNER, CTF} | {a for _, a in MODEL_TIERS})
HOOK_WORDS = ("ultracode", "done")   # mode words this script owns

WRITE_TOOLS = frozenset({"Edit", "Write", "MultiEdit", "NotebookEdit"})
READ_TOOLS = frozenset({"Read", "Glob", "Grep", "LS", "NotebookRead"})
SHELL_TOOLS = frozenset({"Bash", "PowerShell"})
WEB_TOOLS = frozenset({"WebFetch", "WebSearch"})
AGENT_TOOLS = frozenset({"Agent", "Task"})
SSH_WORDS = ("ssh", "scp", "sftp")
USAGE_KEYS = ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens")

DWELL_S = 3.0             # a tool call this soon after a creature change leaves it on screen; 0 = every call
BURN_TOKENS = 500_000     # token burner above this many tokens in the newest request
BURN_HOLD_S = 60.0        # and stays at least this long after the last reading above
ULTRA_GRACE_S = 120.0     # Workflow launched: time for its first agent to show up
ULTRA_GAP_S = 120.0       # between a workflow's phases (no agent running)
AGENT_STALE_S = 900.0     # a subagent silent this long is gone (a missed SubagentStop)
GONE_KEEP_S = 60.0        # a finished subagent's stop time is kept this long (late runs come within seconds)
SESSION_STALE_S = 12 * 3600.0
TOUCH_S = 60.0            # activity stamps are refreshed this coarsely (fewer writes)
LOCK_WAIT_S = 3.0         # background runs. At 0.25 s, 30 agents starting at once kept 5 to 10 in the count
LOCK_WAIT_FG_S = 1.0      # SessionEnd, which Claude Code waits for
TAIL_BYTES = (131072, 1048576)  # transcript tail windows, tried in turn

HOOK_TIMEOUT_S = 5        # start, LOCK_WAIT_S and the replace retries fit inside it
# Interpreter flags in the printed command: -E ignores PYTHON* variables (so no
# PYTHONVERBOSE or PYTHONWARNINGS can print), -S skips site (third party .pth
# code, and time on every tool call). Not -I: it implies -P, which drops this
# script's folder from sys.path.
PY_FLAGS = ("-E", "-S")
# (event, matcher or None, async). SessionEnd runs in the foreground so the clear
# lands before Claude Code exits; the rest never hold up a prompt or a tool.
SETTINGS_PLAN = (
    ("SessionStart", None, True),
    ("UserPromptSubmit", None, True),
    ("PreToolUse", None, True),
    ("PostToolUse", "Agent|Task", True),
    ("SubagentStart", None, True),
    ("SubagentStop", None, True),
    ("Stop", None, True),
    ("Notification", "idle_prompt", True),
    ("PreCompact", None, True),
    ("PostModelSwitch", None, True),
    ("SessionEnd", None, False),
)

# The folder of clawdmeter_state.STATE_FILE and of the daemon, worked out the
# same way. Read through _paths() on every call, so the tests can move it.
BASE_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.join(os.path.expanduser("~"), "AppData", "Local")),
                        "Clawdmeter")
STATE_DEFAULTS = {"agents": 0, "anim": "", "mode": ""}   # clawdmeter_state.DEFAULTS
ANIM_MAX = 23  # firmware keeps the animation name in char[24]


# ---------------------------------------------------------------------------
# JSON without the json package
# ---------------------------------------------------------------------------

class _JSONContext:
    """What json.JSONDecoder hands the C scanner, with json.loads defaults."""
    strict = True
    object_hook = None
    object_pairs_hook = None
    parse_float = float
    parse_int = int
    parse_constant = {"NaN": float("nan"), "Infinity": float("inf"), "-Infinity": float("-inf")}.__getitem__


def _no_default(obj):
    raise TypeError(f"not JSON serialisable: {type(obj).__name__}")


if _c_scanner is not None:
    try:
        _SCAN = _c_scanner(_JSONContext)
        # json.dumps defaults (ensure_ascii, ", " and ": "), as clawdmeter_state.save writes
        _ENC = _c_encoder(None, _no_default, _c_str, None, ": ", ", ", False, False, True)
        # sorted and compact, for hooks.json and for spotting a change in it
        _ENC_SORTED = _c_encoder(None, _no_default, _c_str, None, ":", ",", True, False, True)
    except Exception:  # noqa: BLE001 - an accelerator with another signature: use json
        _c_scanner = None

_WS = " \t\n\r"   # the whitespace JSON allows around a value


def _loads(data):
    """json.loads for str or bytes. Plain UTF 8 goes through the C scanner;
    anything else (a BOM, UTF 16 from PowerShell) through json.loads itself, so
    what the daemon can read, this reads too. ValueError when it is not JSON."""
    if _c_scanner is not None:
        try:
            if isinstance(data, (bytes, bytearray)):
                # a zero byte up front is UTF 16 or 32 (json.detect_encoding's test)
                text = None if b"\x00" in data[:4] else data.decode("utf-8")
            else:
                text = data
        except UnicodeDecodeError:
            text = None
        if isinstance(text, str) and not text.startswith("\ufeff"):
            start = len(text) - len(text.lstrip(_WS))
            try:
                obj, end = _SCAN(text, start)
            except StopIteration:
                raise ValueError("no JSON value") from None
            if text[end:].strip(_WS):
                raise ValueError("more after the JSON value")
            return obj
    import json
    return json.loads(data)


def _dumps(obj, sort: bool = False) -> str:
    """json.dumps(obj) (sort=False) or its sorted, compact form (sort=True)."""
    if _c_scanner is None:
        import json
        return json.dumps(obj, sort_keys=True, separators=(",", ":")) if sort else json.dumps(obj)
    return "".join((_ENC_SORTED if sort else _ENC)(obj, 0))


# ---------------------------------------------------------------------------
# Small pure helpers
# ---------------------------------------------------------------------------

def _num(x):
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def _text(x):
    return x if isinstance(x, str) and x else None


def _runs_ssh(cmd: str) -> bool:
    """ssh, scp or sftp as a command word: at the start, after a separator or a
    path, optionally with .exe, then whitespace. Not inside another word
    (sshd, openssh, paramiko-ssh) and not a path like ~/.ssh. Same answers as
    the regex (?<![\\w.-])(?:ssh|scp|sftp)(?:\\.exe)?\\s (ignoring case), which
    the tests keep as the reference; plain string code because importing re
    costs about 25 ms per run."""
    low = cmd.lower()
    for word in SSH_WORDS:
        i = low.find(word)
        while i >= 0:
            before = low[i - 1] if i else " "
            if not (before.isalnum() or before in "_.-"):
                j = i + len(word)
                if low.startswith(".exe", j):
                    j += 4
                if j < len(low) and low[j].isspace():
                    return True
            i = low.find(word, i + 1)
    return False


def _letter(s: str, i: int) -> bool:
    return 0 <= i < len(s) and "a" <= s[i] <= "z"


def _is_ctf(cwd) -> bool:
    """A folder word that starts with ctf or htb, or ends in ctf; hackthebox or
    holmes anywhere. Same answers as the regex
    (?<![a-z])ctf|ctf(?![a-z])|(?<![a-z])htb|hackthebox|holmes (ignoring case)."""
    if not isinstance(cwd, str):
        return False
    low = cwd.lower()
    if "hackthebox" in low or "holmes" in low:
        return True
    for word, ends_too in (("ctf", True), ("htb", False)):
        i = low.find(word)
        while i >= 0:
            if not _letter(low, i - 1) or (ends_too and not _letter(low, i + len(word))):
                return True
            i = low.find(word, i + 1)
    return False


def tier_of(model) -> str | None:
    """"model opus" for "claude-opus-5", and so on; None when no tier is named."""
    if isinstance(model, dict):
        model = model.get("id") or model.get("display_name")
    if not isinstance(model, str):
        return None
    low = model.lower()
    for key, anim in MODEL_TIERS:
        if key in low:
            return anim
    return None


def tool_anim(tool: str, tool_input) -> str:
    """The working creature for one tool call in the main conversation."""
    if tool in WRITE_TOOLS:
        return WRITE
    if tool in READ_TOOLS:
        return READ
    if tool in SHELL_TOOLS:
        cmd = tool_input.get("command") if isinstance(tool_input, dict) else None
        return SSH if isinstance(cmd, str) and _runs_ssh(cmd) else WORK
    if tool in WEB_TOOLS:
        return CONSULT
    if tool == "Skill":
        return LOADING
    return WORK


def read_tail(path) -> tuple:
    """(model, tokens) of the newest assistant message in a transcript JSONL, read
    from the tail only: the last 128 KB, then the last 1 MB at most, whatever the
    file's size. tokens = input + cache creation + cache read + output of that
    request, i.e. how much the last request carried. (None, None) if unknown,
    missing, or cut off mid line (a line still being written is skipped)."""
    try:
        with open(path, "rb") as f:
            size = f.seek(0, os.SEEK_END)
            for limit in TAIL_BYTES:
                start = max(0, size - limit)
                f.seek(start)
                lines = f.read(size - start).split(b"\n")
                if start:
                    lines = lines[1:]  # cut mid line
                for line in reversed(lines):
                    if b'"assistant"' not in line:
                        continue
                    try:
                        obj = _loads(line)
                    except (ValueError, RecursionError):
                        continue
                    msg = obj.get("message") if isinstance(obj, dict) and obj.get("type") == "assistant" else None
                    model = msg.get("model") if isinstance(msg, dict) else None
                    if not isinstance(model, str) or model.startswith("<"):
                        continue  # "<synthetic>" error notes carry no real usage
                    usage = msg.get("usage")
                    tokens = None
                    if isinstance(usage, dict):
                        tokens = 0
                        for key in USAGE_KEYS:
                            val = usage.get(key)
                            if isinstance(val, int) and not isinstance(val, bool):
                                tokens += val
                    return model, tokens
                if not start:
                    break
    except (OSError, ValueError, TypeError):
        pass
    return None, None


def _notification_counts(payload: dict) -> bool:
    """Only the idle prompt moves the creature; permission prompts belong to the
    approve hook. Without a type field, anything that is not about permission."""
    ntype = payload.get("notification_type")
    if isinstance(ntype, str):
        return ntype == "idle_prompt"
    msg = payload.get("message")
    return not (isinstance(msg, str) and "permission" in msg.lower())


# ---------------------------------------------------------------------------
# Files: state.json, the sidecar, atomic writes, the lock
# ---------------------------------------------------------------------------

def _paths() -> tuple:
    """state.json, hooks.json and hooks.lock, from BASE_DIR at call time."""
    return (os.path.join(BASE_DIR, "state.json"), os.path.join(BASE_DIR, "hooks.json"),
            os.path.join(BASE_DIR, "hooks.lock"))


def load_state(path) -> dict:
    """clawdmeter_state.load() without its imports: the state over the defaults.
    A missing or malformed file, or a field the daemon would reject, reads as
    the default rather than failing the run."""
    out = dict(STATE_DEFAULTS)
    try:
        with open(path, "rb") as f:
            data = _loads(f.read())
    except (OSError, ValueError):
        return out
    if not isinstance(data, dict):
        return out
    agents, anim, mode = data.get("agents"), data.get("anim"), data.get("mode")
    if isinstance(agents, int) and not isinstance(agents, bool) and agents >= 0:
        out["agents"] = agents
    if isinstance(anim, str) and len(anim) <= ANIM_MAX:
        out["anim"] = anim
    if isinstance(mode, str):
        out["mode"] = mode
    return out


def save_state(path, st: dict) -> None:
    """clawdmeter_state.save() without its imports. Windows refuses the replace
    while the daemon holds the file for a read (microseconds), so it retries
    every 5 ms, 0.5 s at most, which keeps a run inside HOOK_TIMEOUT_S."""
    _write_atomic(path, _dumps(st), ".state-", attempts=100, pause=0.005)


def _mkstemp(directory, prefix: str) -> tuple:
    """A new, empty temp file in `directory`, open for writing: (fd, path). The
    guarantees of tempfile.mkstemp (a fresh name, O_EXCL, binary, owner only,
    never through a symlink) without importing tempfile."""
    flags = (os.O_WRONLY | os.O_CREAT | os.O_EXCL
             | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
    for _ in range(100):
        path = os.path.join(directory, f"{prefix}{os.urandom(6).hex()}.tmp")
        try:
            return os.open(path, flags, 0o600), path
        except FileExistsError:
            continue
    raise FileExistsError(f"no free temp file name in {directory}")


def _write_atomic(path, text: str, prefix: str = ".hooks-", attempts: int = 10, pause: float = 0.01) -> None:
    """A temp file in the same folder, then os.replace, so a reader never sees
    half a file. No temp file is left behind when the replace cannot land."""
    folder = os.path.dirname(os.fspath(path)) or "."
    os.makedirs(folder, exist_ok=True)
    fd, tmp = _mkstemp(folder, prefix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(text.encode("utf-8"))
        for attempt in range(attempts):
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if attempt == attempts - 1:
                    raise
                time.sleep(pause)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _clean_sidecar(data) -> dict:
    """The sidecar as trusted shapes only; anything odd is dropped, not raised."""
    out = {"sessions": {}}
    if not isinstance(data, dict):
        return out
    anim_t = _num(data.get("anim_t"))
    if anim_t is not None:
        out["anim_t"] = anim_t
    u = data.get("ultra")
    if (isinstance(u, dict) and isinstance(u.get("sid"), str) and _num(u.get("since")) is not None
            and (u.get("seen") is None or _num(u.get("seen")) is not None)):
        out["ultra"] = {"sid": u["sid"], "since": _num(u["since"]), "seen": _num(u.get("seen"))}
    sessions = data.get("sessions")
    if not isinstance(sessions, dict):
        return out
    for sid, s in sessions.items():
        if not isinstance(s, dict) or _num(s.get("t")) is None:
            continue
        rec = {"t": _num(s["t"])}
        for key in ("agents", "gone"):
            stamps = s.get(key)
            if isinstance(stamps, dict):
                clean = {a: _num(ts) for a, ts in stamps.items() if isinstance(a, str) and _num(ts) is not None}
                if clean:
                    rec[key] = clean
        if s.get("model") in ANIMS and isinstance(s.get("model_src"), str):
            rec["model"], rec["model_src"] = s["model"], s["model_src"]
        burn = s.get("burn")
        if isinstance(burn, dict) and isinstance(burn.get("on"), bool) and _num(burn.get("hi")) is not None:
            rec["burn"] = {"on": burn["on"], "hi": _num(burn["hi"])}
        if s.get("compact") == "manual":
            rec["compact"] = "manual"
        out["sessions"][sid] = rec
    return out


def _load_sidecar(path) -> dict:
    try:
        with open(path, "rb") as f:
            return _clean_sidecar(_loads(f.read()))
    except (OSError, ValueError, RecursionError):
        return _clean_sidecar(None)


class _Lock:
    """Exclusive lock on hooks.lock across processes; gives up after wait_s.
    The OS drops it if a run dies, so a stuck lock cannot outlive its process.
    Waiters back off from 2 ms to 16 ms, so a crowd does not starve the holder."""

    def __init__(self, path, wait_s=None):
        self.path = path
        self.wait_s = LOCK_WAIT_S if wait_s is None else wait_s
        self.fd = None
        self.locked = False

    def _try(self) -> None:
        if os.name == "nt":
            os.lseek(self.fd, 0, os.SEEK_SET)
            msvcrt.locking(self.fd, msvcrt.LK_NBLCK, 1)
        else:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def __enter__(self) -> bool:
        os.makedirs(os.path.dirname(os.fspath(self.path)) or ".", exist_ok=True)
        self.fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o600)
        deadline = time.monotonic() + self.wait_s
        pause = 0.002
        while True:
            try:
                self._try()
                self.locked = True
                return True
            except OSError:
                if time.monotonic() >= deadline:
                    return False
                time.sleep(pause)
                pause = min(pause * 2, 0.016)

    def __exit__(self, *exc) -> None:
        try:
            if self.locked:
                if os.name == "nt":
                    os.lseek(self.fd, 0, os.SEEK_SET)
                    msvcrt.locking(self.fd, msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(self.fd, fcntl.LOCK_UN)
        finally:
            os.close(self.fd)


def _lock_wait(event: str) -> float:
    """How long a run waits for the lock (module values read at call time)."""
    return LOCK_WAIT_FG_S if event == "SessionEnd" else LOCK_WAIT_S


# ---------------------------------------------------------------------------
# One run: the loaded state and sidecar, the event's proposal
# ---------------------------------------------------------------------------

class _Run:
    def __init__(self, event: str, payload: dict, now: float, cur: dict, side: dict):
        self.event, self.p, self.now, self.cur, self.side = event, payload, now, cur, side
        self.sid = _text(payload.get("session_id")) or ""
        self.agent_id = _text(payload.get("agent_id"))
        words = cur["mode"].split()
        self.keep = [w for w in words if w not in HOOK_WORDS]
        self.was_done = "done" in words
        self.done = False
        self.proposal = None
        self.force = False
        self._tail = None
        self.sessions = side["sessions"]
        self._prune()
        # The workflow flag needs both halves: the mode word (the operator can
        # clear it by hand) and its record here.
        if "ultracode" not in words:
            side.pop("ultra", None)
        if self.ultra() and not self.ultra_live():
            self.ultra_off()
        self.sess = self._touch()

    # -- bookkeeping --------------------------------------------------------

    def _prune(self) -> None:
        for sid in list(self.sessions):
            s = self.sessions[sid]
            if s["t"] < self.now - SESSION_STALE_S:
                del self.sessions[sid]
                continue
            for key, keep_s in (("agents", AGENT_STALE_S), ("gone", GONE_KEEP_S)):
                stamps = s.get(key)
                if stamps:
                    for aid in [a for a, ts in stamps.items() if ts < self.now - keep_s]:
                        del stamps[aid]
                    if not stamps:
                        del s[key]

    def _touch(self) -> dict:
        s = self.sessions.get(self.sid)
        if s is None:
            s = self.sessions[self.sid] = {"t": self.now}
        elif abs(self.now - s["t"]) >= TOUCH_S:
            s["t"] = self.now
        return s

    def reset_session(self) -> None:
        self.sess = self.sessions[self.sid] = {"t": self.now}

    def agents(self, sid=None) -> int:
        if sid is None:
            return sum(len(s.get("agents") or ()) for s in self.sessions.values())
        s = self.sessions.get(sid)
        return len(s.get("agents") or ()) if s else 0

    def _newer_than_stop(self, aid) -> bool:
        """False when this run's event is not newer than the agent's own
        SubagentStop: a late start or tool call of an agent that has finished,
        which must not bring it back. A newer one clears the stop, since
        SendMessage can wake a finished agent under the same id."""
        gone = self.sess.get("gone")
        stopped = gone.get(aid) if gone else None
        if stopped is None:
            return True
        if self.now <= stopped:
            return False
        del gone[aid]
        if not gone:
            del self.sess["gone"]
        return True

    def agent_add(self) -> None:
        aid = self.agent_id
        if aid is None:
            aid = f"anon:{time.time_ns()}"
        elif not self._newer_than_stop(aid):
            return
        self.sess.setdefault("agents", {})[aid] = self.now
        self.ultra_seen()

    def agent_remove(self) -> None:
        ag = self.sess.get("agents") or {}
        aid = self.agent_id
        if aid is None:  # nothing to match on: the oldest anonymous one
            anon = sorted((ts, a) for a, ts in ag.items() if a.startswith("anon:"))
            aid = anon[0][1] if anon else None
        else:  # remembered, so a start or tool call that arrives late cannot revive it
            gone = self.sess.setdefault("gone", {})
            gone[aid] = max(gone.get(aid, self.now), self.now)
        ag.pop(aid, None)
        if not ag:
            self.sess.pop("agents", None)
        self.ultra_seen()

    def agent_seen(self) -> None:
        """A subagent's own tool call: refresh it (and put it back if it was
        pruned while one long tool ran), unless it is older than its stop."""
        if not self._newer_than_stop(self.agent_id):
            return
        ag = self.sess.setdefault("agents", {})
        ts = ag.get(self.agent_id)
        if ts is None or abs(self.now - ts) >= TOUCH_S:
            ag[self.agent_id] = self.now
        self.ultra_seen()

    # -- workflow (ultracode) -------------------------------------------------

    def ultra(self):
        return self.side.get("ultra")

    def ultra_on(self) -> None:
        self.side["ultra"] = {"sid": self.sid, "since": self.now, "seen": None}

    def ultra_off(self) -> None:
        self.side.pop("ultra", None)

    def ultra_seen(self) -> None:
        u = self.ultra()
        if u and u["sid"] == self.sid and (u["seen"] is None or abs(self.now - u["seen"]) >= 5.0):
            u["seen"] = self.now

    def ultra_live(self) -> bool:
        u = self.ultra()
        if not u:
            return False
        if self.agents(u["sid"]):
            return True
        if u["seen"] is None:
            return self.now - u["since"] < ULTRA_GRACE_S
        return self.now - u["seen"] < ULTRA_GAP_S

    # -- what Claude is running on ------------------------------------------

    def tail(self) -> tuple:
        if self._tail is None:
            path = _text(self.p.get("transcript_path"))
            self._tail = read_tail(path) if path else (None, None)
        return self._tail

    def set_model(self, tier, src: str) -> None:
        if tier and (self.sess.get("model"), self.sess.get("model_src")) != (tier, src):
            self.sess["model"], self.sess["model_src"] = tier, src

    def model(self, tail_model=None):
        """The session's tier. A switch or a SessionStart payload outranks the
        transcript, which still names the old model until the next reply."""
        if self.sess.get("model_src") in (None, "tail"):
            self.set_model(tier_of(tail_model), "tail")
        return self.sess.get("model")

    def burner(self, tokens) -> tuple:
        """(on, just_crossed). On above BURN_TOKENS; held BURN_HOLD_S after the
        last reading above; an unknown reading keeps the held state."""
        b = self.sess.get("burn") or {}
        was_on, old_hi = b.get("on", False), b.get("hi", 0.0)
        hi = old_hi
        if tokens is not None and tokens > BURN_TOKENS:
            on = True
            if abs(self.now - hi) >= 10.0:
                hi = self.now
        else:
            on = was_on and self.now - hi < BURN_HOLD_S
        if (on, hi) != (was_on, old_hi):
            self.sess["burn"] = {"on": on, "hi": hi}
        return on, on and not was_on

    def ctf(self) -> bool:
        return _is_ctf(self.p.get("cwd")) or any(w.lower() == "ctf" for w in self.keep)

    # -- choosing ---------------------------------------------------------------

    def turn_start(self, default: str, tokens, tail_model) -> str:
        on, _ = self.burner(tokens)
        if on:
            return BURNER
        if self.ctf():
            return CTF
        return self.model(tail_model) or default

    def agents_anim(self, extra: int = 0) -> str:
        if self.ultra_live():
            return ULTRA_WORK
        return ULTRA_WORK if self.agents() + extra >= 3 else TWO_AGENTS

    def propose(self, anim: str, force: bool = False) -> None:
        self.proposal, self.force = anim, force

    def stale(self) -> bool:
        """This run's event is older than the last creature change: it waited
        behind newer runs, so what it would show is out of date. Never for
        SessionEnd: each run takes its time only once Python has started (tens
        of ms that vary), SessionEnd can follow Stop by milliseconds (claude -p),
        and no later event would take the "job done" down."""
        if self.event == "SessionEnd":
            return False
        last = self.side.get("anim_t")
        return last is not None and self.now < last

    def finish(self) -> dict:
        anim = self.cur["anim"]
        done = self.done
        if self.stale():  # bookkeeping above still counts; the creature and "job done" stay
            done = self.was_done
        else:
            proposal, force = self.proposal, self.force
            if self.was_done and not self.done:  # the event after a "job done" clears it
                if proposal is None:
                    proposal = ""
                force = True
            if proposal is not None and proposal != anim and (proposal == "" or proposal in ANIMS):
                last = self.side.get("anim_t")
                if force or last is None or self.now - last >= DWELL_S:
                    anim = proposal
                    self.side["anim_t"] = self.now
        words = list(self.keep)
        if self.ultra():
            words.append("ultracode")
        if done:
            words.append("done")
        return {"agents": self.agents(), "anim": anim, "mode": " ".join(words)}


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

def _on_session_start(r: _Run) -> None:
    if r.p.get("source") == "compact":
        # After a compaction, possibly mid turn: agents and creature carry on.
        # A /compact typed by hand has nothing after it, so its loading bar goes.
        if r.sess.pop("compact", None) == "manual" and r.cur["anim"] == LOADING:
            r.propose("", force=True)
        return
    r.reset_session()
    u = r.ultra()
    if u and u["sid"] == r.sid:
        r.ultra_off()
    r.set_model(tier_of(r.p.get("model")), "start")
    tokens, tail_model = _num(r.p.get("context_tokens")), None
    if tokens is None or not r.sess.get("model"):
        tail_model, tail_tokens = r.tail()
        tokens = tail_tokens if tokens is None else tokens
    r.propose(r.turn_start("", tokens, tail_model), force=True)


def _on_prompt(r: _Run) -> None:
    tail_model, tokens = r.tail()
    r.propose(r.turn_start(THINK, tokens, tail_model), force=True)


def _on_pre_tool(r: _Run) -> None:
    tool = _text(r.p.get("tool_name"))
    if tool is None:
        return
    if r.agent_id:  # a subagent's own tool call
        r.agent_seen()
        r.propose(r.agents_anim())
        return
    if tool == "Workflow":
        r.ultra_on()
        r.propose(ULTRA_ENTER, force=True)
        return
    if tool in AGENT_TOOLS:  # the split; SubagentStart does the counting
        r.propose(r.agents_anim(extra=1), force=True)
        return
    if r.ultra_live():
        r.propose(ULTRA_WORK)
        return
    tail_model, tokens = r.tail()
    r.model(tail_model)
    _, crossed = r.burner(tokens)
    if crossed:
        r.propose(BURNER, force=True)
        return
    r.propose(tool_anim(tool, r.p.get("tool_input")))


def _on_post_tool(r: _Run) -> None:
    # Counting is SubagentStart/SubagentStop's job (a background agent's
    # PostToolUse fires at launch). Only the "job done" clear applies here.
    if r.agent_id:
        r.agent_seen()


def _on_subagent_start(r: _Run) -> None:
    r.agent_add()
    r.propose(r.agents_anim())


def _on_subagent_stop(r: _Run) -> None:
    r.agent_remove()
    if r.agents() == 0:
        r.propose(AGENTS_JOIN, force=True)
    else:
        r.propose(r.agents_anim())


def _on_stop(r: _Run) -> None:
    if r.agent_id:  # a subagent's stop arrives as SubagentStop; nothing to do
        return
    if r.agents(r.sid):  # background agents still at it
        r.propose(r.agents_anim())
        return
    u = r.ultra()
    if u and u["sid"] == r.sid:
        if u["seen"] is None and r.now - u["since"] < ULTRA_GRACE_S:
            return  # the workflow was just launched; its agents are not up yet
        r.ultra_off()
    r.propose(JOB_DONE, force=True)
    r.done = True


def _on_notification(r: _Run) -> None:
    if r.agents() or r.ultra_live():
        return  # background work goes on and its events drive the creature
    r.propose("", force=True)


def _on_pre_compact(r: _Run) -> None:
    if r.p.get("trigger") == "manual":
        r.sess["compact"] = "manual"
    else:
        r.sess.pop("compact", None)
    r.propose(LOADING, force=True)


def _on_model_switch(r: _Run) -> None:
    r.set_model(tier_of(r.p.get("to_model")), "switch")


def _on_session_end(r: _Run) -> None:
    r.sessions.pop(r.sid, None)
    u = r.ultra()
    if u and u["sid"] == r.sid:
        r.ultra_off()
    r.propose("", force=True)


HANDLERS = {
    "SessionStart": _on_session_start,
    "UserPromptSubmit": _on_prompt,
    "PreToolUse": _on_pre_tool,
    "PostToolUse": _on_post_tool,
    "SubagentStart": _on_subagent_start,
    "SubagentStop": _on_subagent_stop,
    "Stop": _on_stop,
    "Notification": _on_notification,
    "PreCompact": _on_pre_compact,
    "PostModelSwitch": _on_model_switch,
    "SessionEnd": _on_session_end,
}


def handle(event, payload, now: float | None = None) -> bool:
    """Apply one hook event. True when it was taken in (whether or not anything
    changed); False for an unknown event, a notification that is not ours, bad
    input or a lock that stayed busy. `now` is the event's time: taken before
    the wait for the lock, so a run that waited still knows its place in line."""
    fn = HANDLERS.get(event) if isinstance(event, str) else None
    if fn is None or not isinstance(payload, dict):
        return False
    if event == "Notification" and not _notification_counts(payload):
        return False
    now = time.time() if now is None else now
    state_path, side_path, lock_path = _paths()
    with _Lock(lock_path, _lock_wait(event)) as locked:
        if not locked:
            return False
        cur = load_state(state_path)
        side = _load_sidecar(side_path)
        before = _dumps(side, sort=True)
        run = _Run(event, payload, now, cur, side)
        fn(run)
        new = run.finish()
        # The bookkeeping first: state.json is worked out from it, so if the
        # daemon holds state.json past the retries, the next run still counts right.
        after = _dumps(side, sort=True)
        if after != before:
            _write_atomic(side_path, after)
        if new != cur:
            save_state(state_path, new)
    return True


# ---------------------------------------------------------------------------
# Settings snippet and entry point
# ---------------------------------------------------------------------------

def hook_python() -> str:
    """The interpreter for the printed command: the one running this, or the
    base Python behind it when that is a venv's python.exe. A venv's python.exe
    is a launcher that starts a second process on every run (about 20 ms more
    on the development machine), and the hooks need nothing from a venv."""
    exe = sys.executable or "python"
    base = getattr(sys, "_base_executable", None)
    if (sys.prefix != sys.base_prefix and isinstance(base, str) and base
            and os.path.normcase(base) != os.path.normcase(exe) and os.path.isfile(base)):
        return base
    return exe


def settings_snippet(python: str | None = None, script: str | None = None) -> dict:
    """The "hooks" block for settings.json: exec form (no shell, so no profile
    output and no quoting), absolute paths, small timeouts. Writes nothing."""
    python = python or hook_python()
    script = script or os.path.abspath(__file__)
    hooks = {}
    for event, matcher, background in SETTINGS_PLAN:
        handler = {"type": "command", "command": python, "args": [*PY_FLAGS, script, event],
                   "timeout": HOOK_TIMEOUT_S}
        if background:
            handler["async"] = True
        group = {"hooks": [handler]}
        if matcher is not None:
            group = {"matcher": matcher, **group}
        hooks[event] = [group]
    return {"hooks": hooks}


def _read_payload(stream):
    """The hook JSON from stdin as a dict, or None. Bytes where possible, so a
    non ASCII path or prompt decodes as UTF 8 whatever the console code page."""
    if stream is None:
        return None
    try:
        if stream.isatty():
            return None  # run by hand without a pipe: never wait for typing
    except (AttributeError, ValueError, OSError):
        pass
    buf = getattr(stream, "buffer", None)
    raw = buf.read() if buf is not None else stream.read()
    if not raw:
        return None
    try:
        data = _loads(raw)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def main(argv: list[str] | None = None) -> int:
    try:
        args = sys.argv[1:] if argv is None else list(argv)
        if args[:1] == ["--print-settings"]:
            import json  # a one off by hand: the indented output is worth the import
            sys.stdout.write(json.dumps(settings_snippet(), indent=2) + "\n")
            return 0
        payload = _read_payload(sys.stdin)
        if payload is not None:
            handle(args[0] if args else payload.get("hook_event_name"), payload)
    except Exception:  # noqa: BLE001 - a broken hook must never change Claude Code's behaviour
        pass
    return 0


if __name__ == "__main__":
    try:
        main()
    except BaseException:  # noqa: BLE001 - even an interrupt: print nothing, exit 0
        pass
    sys.exit(0)
