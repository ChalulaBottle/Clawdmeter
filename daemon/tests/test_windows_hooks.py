#!/usr/bin/env python3
"""Claude Code hooks that make the creature follow Claude: daemon/clawdmeter_hooks.py.

conftest points the hooks' BASE_DIR and clawdmeter_state.STATE_FILE at the same
tmp folder, so the live %LOCALAPPDATA%\\Clawdmeter files are never touched and
state.load() reads back what a hook wrote. Most tests run the hook the way
Claude Code does (main([event]) with the JSON on a byte stdin) on a hand-set
clock, so the dwell and the hold times are exact. A few run the script as its
own process, with LOCALAPPDATA pointed at tmp_path.

Run: python -m pytest daemon/tests/test_windows_hooks.py -x -q
"""
import io
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import threading
import time
import types
from pathlib import Path

import pytest

import daemon.clawdmeter_hooks as hooks
from daemon import clawdmeter_state as state

REPO = Path(__file__).resolve().parents[2]
FIRMWARE_TABLE = REPO / "firmware" / "src" / "splash_animations.h"
T0 = 1_800_000_000.0                      # the hand-set clock starts here
WORK = r"C:\Users\dev\projects\webapp"    # a working directory with nothing CTF about it


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _stdin(text: str, encoding: str = "utf-8"):
    """What Claude Code hands the script: UTF-8 bytes on a pipe, wrapped in a
    text stream that may believe in another code page (as a Windows console does)."""
    return io.TextIOWrapper(io.BytesIO(text.encode("utf-8")), encoding=encoding)


@pytest.fixture
def clock(monkeypatch):
    """hooks.time with a hand-set time(); everything else passes through."""
    c = types.SimpleNamespace(t=T0)
    fake = types.SimpleNamespace(time=lambda: c.t, time_ns=time.time_ns,
                                 monotonic=time.monotonic, sleep=time.sleep)
    monkeypatch.setattr(hooks, "time", fake)
    return c


@pytest.fixture
def fire(monkeypatch, capsys, clock):
    """Run one hook as Claude Code does. `at` is seconds after T0. Asserts the
    run exited 0 and printed nothing; returns the state it left behind."""
    def _fire(event, at=None, **fields):
        if at is not None:
            clock.t = T0 + at
        payload = {"session_id": "s1", "cwd": WORK, "hook_event_name": event, **fields}
        monkeypatch.setattr(sys, "stdin", _stdin(json.dumps(payload, ensure_ascii=False)))
        assert hooks.main([event]) == 0
        assert capsys.readouterr() == ("", "")
        return state.load()
    return _fire


def _sidecar(base):
    return json.loads((base / "hooks.json").read_text(encoding="utf-8"))


def _reply(model, tokens):
    """One assistant line as Claude Code writes it. All four usage fields count."""
    q = tokens // 4
    usage = {"input_tokens": q, "cache_creation_input_tokens": q,
             "cache_read_input_tokens": q, "output_tokens": tokens - 3 * q}
    return {"type": "assistant", "message": {"role": "assistant", "model": model, "usage": usage,
                                             "content": [{"type": "text", "text": "done"}]}}


def _transcript(path, *replies, tail=()):
    """A transcript JSONL with one prompt and one reply per (model, tokens)."""
    lines = []
    for model, tokens in replies:
        lines.append({"type": "user", "message": {"role": "user", "content": "go on"}})
        lines.append(_reply(model, tokens))
    lines.extend(tail)
    path.write_text("\n".join(json.dumps(x) for x in lines) + "\n", encoding="utf-8")
    return str(path)


def _run_script(tmp_path, args, stdin: bytes):
    """The script as its own process, launched with the flags settings.json
    uses, and LOCALAPPDATA pointed at tmp_path so the live state is out of reach."""
    env = dict(os.environ, LOCALAPPDATA=str(tmp_path / "la"))
    return subprocess.run([sys.executable, *hooks.PY_FLAGS, hooks.__file__, *args], input=stdin,
                          capture_output=True, env=env, cwd=str(tmp_path), timeout=60)


def _firmware_names() -> set:
    """The "name" field of every row of splash_anims[] in the firmware table."""
    text = FIRMWARE_TABLE.read_text(encoding="utf-8")
    table = text[text.index("splash_anims[SPLASH_ANIM_COUNT]"):]
    names = re.findall(r'^\s*\{"([^"]*)",', table, re.MULTILINE)
    count = int(re.search(r"#define SPLASH_ANIM_COUNT (\d+)", text).group(1))
    assert len(names) == count, "table rows and SPLASH_ANIM_COUNT disagree"
    return set(names)


# ---------------------------------------------------------------------------
# Tool calls: the working creatures
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("tool, anim", [
    ("Edit", "echo write"), ("Write", "echo write"), ("MultiEdit", "echo write"),
    ("NotebookEdit", "echo write"),
    ("Read", "echo read"), ("Glob", "echo read"), ("Grep", "echo read"),
    ("Bash", "echo work"), ("PowerShell", "echo work"),
    ("WebFetch", "echo consult"), ("WebSearch", "echo consult"),
    ("Skill", "echo loading"),
    ("TodoWrite", "echo work"), ("mcp__github__create_issue", "echo work"), ("NewTool", "echo work"),
])
def test_tool_call_picks_the_working_creature(fire, tool, anim):
    tool_input = {"command": "npm test"} if tool in ("Bash", "PowerShell") else {}
    assert fire("PreToolUse", tool_name=tool, tool_input=tool_input, tool_use_id="t1") == \
        {"agents": 0, "anim": anim, "mode": ""}


@pytest.mark.parametrize("tool, command", [
    ("Bash", "ssh fox-pool"),
    ("Bash", "ssh -p 2222 user@10.0.0.5 uptime"),
    ("Bash", "cd build && scp app.tar.gz host:/srv/"),
    ("Bash", "sftp -b batch.txt user@host"),
    ("Bash", "git pull; ssh host 'sudo systemctl restart app'"),
    ("Bash", "/usr/bin/ssh\thost"),
    ("Bash", "SSH Host"),
    ("PowerShell", r"C:\Windows\System32\OpenSSH\ssh.exe fox-pool 'uptime'"),
])
def test_ssh_scp_and_sftp_show_echo_ssh(fire, tool, command):
    assert fire("PreToolUse", tool_name=tool, tool_input={"command": command})["anim"] == "echo ssh"


@pytest.mark.parametrize("command", [
    "cat ~/.ssh/config",
    r"type C:\ssh-keys\id_ed25519.pub",
    "pip install paramiko-ssh",
    "openssh --version",
    "systemctl status sshd",
    "grep -r sshd_config .",
])
def test_ssh_inside_another_word_or_path_is_plain_work(fire, command):
    assert fire("PreToolUse", tool_name="Bash", tool_input={"command": command})["anim"] == "echo work"


def test_shell_call_without_a_command_is_plain_work():
    assert hooks.tool_anim("Bash", None) == "echo work"
    assert hooks.tool_anim("Bash", {"command": 7}) == "echo work"
    assert hooks.tool_anim("PowerShell", {}) == "echo work"


def test_tool_call_without_a_tool_name_changes_nothing(fire):
    fire("PreToolUse", at=0, tool_name="Read")
    assert fire("PreToolUse", at=10)["anim"] == "echo read"


def test_quick_tool_changes_wait_for_the_dwell_and_moments_do_not(fire):
    assert fire("PreToolUse", at=0, tool_name="Read")["anim"] == "echo read"
    assert fire("PreToolUse", at=1, tool_name="Edit")["anim"] == "echo read"      # 1 s on screen: held
    assert fire("PreToolUse", at=hooks.DWELL_S, tool_name="Edit")["anim"] == "echo write"
    assert fire("UserPromptSubmit", at=hooks.DWELL_S + 0.1, prompt="and now")["anim"] == "echo think spin"


def test_a_name_outside_the_known_set_is_never_written(fire, monkeypatch):
    monkeypatch.setattr(hooks, "tool_anim", lambda tool, tool_input: "not a creature")
    assert fire("PreToolUse", tool_name="Read")["anim"] == ""


# ---------------------------------------------------------------------------
# Session, prompt, stop, notification, compaction
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("source", ["startup", "resume", "clear"])
def test_session_start_hands_the_creature_back_and_resets_this_sessions_agents(fire, source):
    fire("SubagentStart", at=0, agent_id="a1", agent_type="Explore")
    fire("SubagentStart", at=1, agent_id="a2", agent_type="Explore")
    fire("SubagentStart", at=2, session_id="s2", agent_id="b1", agent_type="Plan")
    fire("PreToolUse", at=10, tool_name="Read")
    assert state.load() == {"agents": 3, "anim": "echo read", "mode": ""}
    # this session's two are gone; the other session's agent still counts
    assert fire("SessionStart", at=11, source=source) == {"agents": 1, "anim": "", "mode": ""}


def test_prompt_shows_the_thinking_creature(fire):
    assert fire("UserPromptSubmit", prompt="fix the failing test") == \
        {"agents": 0, "anim": "echo think spin", "mode": ""}


def test_stop_says_job_done_and_the_next_event_clears_it(fire):
    fire("PreToolUse", at=0, tool_name="Edit")
    assert fire("Stop", at=1, stop_hook_active=False, last_assistant_message="All green.") == \
        {"agents": 0, "anim": "job done", "mode": "done"}
    # PostToolUse has no creature of its own, so the clear hands back to the device
    assert fire("PostToolUse", at=2, tool_name="Agent") == {"agents": 0, "anim": "", "mode": ""}


def test_after_job_done_the_next_creature_shows_at_once(fire):
    fire("Stop", at=0)
    assert fire("PreToolUse", at=0.5, tool_name="Read") == {"agents": 0, "anim": "echo read", "mode": ""}


def test_stop_waits_while_background_agents_still_run(fire):
    fire("SubagentStart", at=0, agent_id="bg1")
    assert fire("Stop", at=5) == {"agents": 1, "anim": "two agents", "mode": ""}
    assert fire("SubagentStop", at=30, agent_id="bg1") == {"agents": 0, "anim": "agents join", "mode": ""}


def test_a_stop_from_inside_a_subagent_is_not_the_end_of_the_turn(fire):
    fire("PreToolUse", at=0, tool_name="Read")
    assert fire("Stop", at=5, agent_id="a1") == {"agents": 0, "anim": "echo read", "mode": ""}


@pytest.mark.parametrize("fields", [
    {"notification_type": "idle_prompt", "message": "Claude is waiting for your input"},
    {"message": "Claude is waiting for your input"},        # no type field: judged by the text
])
def test_idle_prompt_hands_the_creature_back(fire, fields):
    fire("PreToolUse", at=0, tool_name="Bash", tool_input={"command": "pytest"})
    assert fire("Notification", at=70, **fields)["anim"] == ""


@pytest.mark.parametrize("fields", [
    {"notification_type": "permission_prompt", "message": "Claude needs your permission to use Bash"},
    {"message": "Claude needs your permission to use Bash"},
    {"notification_type": "auth_success", "message": "Signed in"},
])
def test_other_notifications_leave_everything_alone(fire, relay_files, fields):
    """Permission prompts belong to the approve hook; nothing is rewritten."""
    fire("PreToolUse", at=0, tool_name="Edit")
    before = {p.name: p.read_bytes() for p in relay_files.glob("*.json")}
    assert fire("Notification", at=70, **fields)["anim"] == "echo write"
    assert {p.name: p.read_bytes() for p in relay_files.glob("*.json")} == before


def test_idle_prompt_while_agents_work_changes_nothing(fire):
    fire("SubagentStart", at=0, agent_id="a1")
    assert fire("Notification", at=70, notification_type="idle_prompt")["anim"] == "two agents"


def test_compaction_mid_turn_leaves_agents_and_creature_alone(fire):
    fire("SubagentStart", at=0, agent_id="a1")
    assert fire("PreCompact", at=5, trigger="auto", custom_instructions="")["anim"] == "echo loading"
    assert fire("SessionStart", at=20, source="compact") == {"agents": 1, "anim": "echo loading", "mode": ""}
    assert fire("PreToolUse", at=30, tool_name="Read")["anim"] == "echo read"


def test_a_compact_typed_by_hand_takes_its_loading_bar_down_afterwards(fire):
    assert fire("PreCompact", at=0, trigger="manual", custom_instructions="")["anim"] == "echo loading"
    assert fire("SessionStart", at=8, source="compact")["anim"] == ""


def test_session_end_clears_this_sessions_state(fire, relay_files):
    fire("SubagentStart", at=0, agent_id="a1")
    fire("PreToolUse", at=1, tool_name="Workflow")
    assert state.load() == {"agents": 1, "anim": "ultracode enter", "mode": "ultracode"}
    assert fire("SessionEnd", at=5, reason="prompt_input_exit") == {"agents": 0, "anim": "", "mode": ""}
    assert "s1" not in _sidecar(relay_files)["sessions"]


def test_session_end_keeps_other_sessions_and_mode_words_set_by_hand(fire):
    state.save({"agents": 0, "anim": "", "mode": "ctf"})
    fire("SubagentStart", at=0, session_id="s2", agent_id="b1")
    assert fire("Stop", at=1)["mode"] == "ctf done"
    assert fire("SessionEnd", at=2) == {"agents": 1, "anim": "", "mode": "ctf"}


# ---------------------------------------------------------------------------
# Subagents and workflows
# ---------------------------------------------------------------------------

def test_subagents_count_up_and_down_and_join_at_zero(fire):
    # The split shows at once; the count comes from SubagentStart, because a
    # background agent's PostToolUse fires at launch, not when it finishes.
    assert fire("PreToolUse", at=0, tool_name="Agent", tool_input={"subagent_type": "Explore"}) == \
        {"agents": 0, "anim": "two agents", "mode": ""}
    assert fire("SubagentStart", at=1, agent_id="a1", agent_type="Explore")["agents"] == 1
    assert fire("SubagentStart", at=2, agent_id="a2", agent_type="Explore") == \
        {"agents": 2, "anim": "two agents", "mode": ""}
    assert fire("SubagentStart", at=2.5, agent_id="a2")["agents"] == 2      # the same agent counts once
    assert fire("SubagentStart", at=5, agent_id="a3", agent_type="Plan") == \
        {"agents": 3, "anim": "ultracode work", "mode": ""}
    assert fire("PostToolUse", at=6, tool_name="Agent")["agents"] == 3
    assert fire("SubagentStop", at=10, agent_id="a3") == {"agents": 2, "anim": "two agents", "mode": ""}
    assert fire("SubagentStop", at=11, agent_id="a1")["agents"] == 1
    assert fire("SubagentStop", at=14, agent_id="a2") == {"agents": 0, "anim": "agents join", "mode": ""}


def test_task_is_the_agent_tool_under_its_old_name(fire):
    assert fire("PreToolUse", tool_name="Task")["anim"] == "two agents"


def test_a_third_agent_turns_the_split_into_ultracode_work(fire):
    fire("SubagentStart", at=0, agent_id="a1")
    fire("SubagentStart", at=0, agent_id="a2")
    assert fire("PreToolUse", at=1, tool_name="Agent")["anim"] == "ultracode work"


def test_a_subagents_own_tool_calls_show_the_agents_creature(fire):
    fire("SubagentStart", at=0, agent_id="a1")
    assert fire("PreToolUse", at=4, tool_name="Read")["anim"] == "echo read"            # main conversation
    assert fire("PreToolUse", at=8, agent_id="a1", agent_type="Explore", tool_name="Edit")["anim"] == "two agents"


def test_a_missed_subagent_stop_expires(fire):
    fire("SubagentStart", at=0, agent_id="lost")
    assert fire("UserPromptSubmit", at=60)["agents"] == 1
    assert fire("UserPromptSubmit", at=60 + hooks.AGENT_STALE_S + 1)["agents"] == 0


def test_a_subagents_own_tool_calls_keep_it_counted(fire):
    fire("SubagentStart", at=0, agent_id="a1")
    fire("PreToolUse", at=800, agent_id="a1", tool_name="Grep")
    assert fire("UserPromptSubmit", at=1000)["agents"] == 1


def test_workflow_enters_ultracode_then_works_in_it_until_its_agents_are_done(fire):
    assert fire("PreToolUse", at=0, tool_name="Workflow", tool_input={"script": "lanes"}) == \
        {"agents": 0, "anim": "ultracode enter", "mode": "ultracode"}
    assert fire("PreToolUse", at=1, tool_name="Read")["anim"] == "ultracode enter"   # its screen time first
    assert fire("PreToolUse", at=5, tool_name="Read")["anim"] == "ultracode work"
    # Claude's turn ends right after the launch, before the agents are up: no "job done"
    assert fire("Stop", at=6) == {"agents": 0, "anim": "ultracode work", "mode": "ultracode"}
    assert fire("SubagentStart", at=10, agent_id="w1", agent_type="general-purpose") == \
        {"agents": 1, "anim": "ultracode work", "mode": "ultracode"}
    assert fire("SubagentStart", at=11, agent_id="w2")["agents"] == 2
    assert fire("SubagentStop", at=40, agent_id="w1")["anim"] == "ultracode work"
    assert fire("SubagentStop", at=50, agent_id="w2") == \
        {"agents": 0, "anim": "agents join", "mode": "ultracode"}
    assert fire("Stop", at=55) == {"agents": 0, "anim": "job done", "mode": "done"}
    assert fire("UserPromptSubmit", at=60) == {"agents": 0, "anim": "echo think spin", "mode": ""}


def test_workflow_mode_ends_when_its_agents_stay_gone(fire):
    fire("PreToolUse", at=0, tool_name="Workflow")
    fire("SubagentStart", at=5, agent_id="w1")
    fire("SubagentStop", at=30, agent_id="w1")
    assert fire("PreToolUse", at=40, tool_name="Read")["anim"] == "ultracode work"    # between phases
    assert fire("PreToolUse", at=30 + hooks.ULTRA_GAP_S + 1, tool_name="Read") == \
        {"agents": 0, "anim": "echo read", "mode": ""}


def test_workflow_whose_agents_never_show_up_times_out(fire):
    fire("PreToolUse", at=0, tool_name="Workflow")
    assert fire("PreToolUse", at=hooks.ULTRA_GRACE_S + 1, tool_name="Edit") == \
        {"agents": 0, "anim": "echo write", "mode": ""}


def test_clearing_the_mode_word_by_hand_ends_workflow_mode(fire):
    fire("PreToolUse", at=0, tool_name="Workflow")
    state.save({"agents": 0, "anim": "ultracode enter", "mode": ""})
    assert fire("PreToolUse", at=5, tool_name="Edit") == {"agents": 0, "anim": "echo write", "mode": ""}


# ---------------------------------------------------------------------------
# Model tier, token burner, CTF
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("model, tier", [
    ("claude-haiku-4-5-20251001", "model haiku"),
    ("claude-sonnet-4-6", "model sonnet"),
    ("claude-opus-5", "model opus"),
    ("claude-opus-5-5[1m]", "model opus"),
    ("claude-fable-5", "model fable"),
    ("Fable", "model fable"),
    ({"id": "claude-sonnet-4-6", "display_name": "Sonnet 4.6"}, "model sonnet"),
    ("gpt-4o", None), ("", None), (None, None), (42, None),
])
def test_model_names_map_to_their_tier(model, tier):
    assert hooks.tier_of(model) == tier


def test_session_start_model_field_picks_the_tier(fire):
    assert fire("SessionStart", source="startup", model="claude-fable-5")["anim"] == "model fable"
    assert fire("UserPromptSubmit", at=5, prompt="hi")["anim"] == "model fable"


def test_transcript_tail_names_the_model_when_no_payload_does(fire, tmp_path):
    t = _transcript(tmp_path / "t.jsonl", ("claude-sonnet-4-6", 1_000), ("claude-opus-5", 2_000))
    assert fire("UserPromptSubmit", transcript_path=t, prompt="hi")["anim"] == "model opus"
    assert fire("SessionStart", at=1, source="resume", transcript_path=t)["anim"] == "model opus"


def test_model_switch_outranks_the_transcript(fire, tmp_path):
    t = _transcript(tmp_path / "t.jsonl", ("claude-opus-5", 1_000))
    assert fire("UserPromptSubmit", at=0, transcript_path=t)["anim"] == "model opus"
    fire("PostModelSwitch", at=1, from_model="claude-opus-5", to_model="claude-haiku-4-5-20251001")
    # the transcript names opus until the next reply; the switch wins
    assert fire("UserPromptSubmit", at=2, transcript_path=t)["anim"] == "model haiku"


def test_working_creature_wins_over_the_tier_while_tools_run(fire, tmp_path):
    t = _transcript(tmp_path / "t.jsonl", ("claude-fable-5", 1_000))
    assert fire("UserPromptSubmit", at=0, transcript_path=t)["anim"] == "model fable"
    assert fire("PreToolUse", at=4, transcript_path=t, tool_name="Edit")["anim"] == "echo write"


def test_transcript_tail_finds_the_newest_reply_and_its_tokens(tmp_path):
    path = tmp_path / "t.jsonl"
    _transcript(path, ("claude-haiku-4-5-20251001", 1_000), ("claude-opus-5", 123_456),
                tail=[{"type": "user", "message": {"role": "user", "content": [
                          {"type": "tool_result", "content": "assistant"}]}},
                      _reply("<synthetic>", 0)])                     # an error note: skipped
    assert hooks.read_tail(str(path)) == ("claude-opus-5", 123_456)
    assert hooks.read_tail(str(tmp_path / "missing.jsonl")) == (None, None)


def test_transcript_tail_never_scans_the_whole_file(tmp_path):
    path = tmp_path / "t.jsonl"
    _transcript(path, ("claude-sonnet-4-6", 1_000))
    with open(path, "a", encoding="utf-8") as f:     # a tool result bigger than the last window
        f.write(json.dumps({"type": "user", "message": {"role": "user", "content": "x" * 1_200_000}}) + "\n")
    assert hooks.read_tail(str(path)) == (None, None)


def test_token_burner_past_500k_with_a_60s_hold(fire, tmp_path):
    path = tmp_path / "t.jsonl"
    t = _transcript(path, ("claude-opus-5-5[1m]", 620_000))
    assert fire("UserPromptSubmit", at=0, transcript_path=t)["anim"] == "token burner"
    _transcript(path, ("claude-opus-5-5[1m]", 90_000))              # compacted: the reading drops
    assert fire("UserPromptSubmit", at=30, transcript_path=t)["anim"] == "token burner"
    assert fire("UserPromptSubmit", at=hooks.BURN_HOLD_S + 1, transcript_path=t)["anim"] == "model opus"


def test_token_burner_flashes_on_the_tool_call_that_crosses(fire, tmp_path):
    path = tmp_path / "t.jsonl"
    t = _transcript(path, ("claude-opus-5-5[1m]", 480_000))
    assert fire("PreToolUse", at=0, transcript_path=t, tool_name="Read")["anim"] == "echo read"
    _transcript(path, ("claude-opus-5-5[1m]", 480_000), ("claude-opus-5-5[1m]", 505_000))
    assert fire("PreToolUse", at=1, transcript_path=t, tool_name="Read")["anim"] == "token burner"
    # still above but no new crossing: the work creature is back after the dwell
    assert fire("PreToolUse", at=5, transcript_path=t, tool_name="Read")["anim"] == "echo read"


@pytest.mark.parametrize("cwd", [
    r"C:\Users\OOrte\Downloads\Temp AEGIS_Deep\h7ctf-2026-quals",
    r"C:\Users\OOrte\Downloads\Temp AEGIS_Deep\htb-borrowedname\work",
    r"C:\Users\OOrte\Downloads\Temp AEGIS_Deep\holmes-launch",
    r"C:\labs\HackTheBox\Sherlocks",
    "/home/kali/ctf/pwn",
    r"D:\picoCTF",
])
def test_ctf_folder_puts_the_hoodie_on_at_start_and_at_every_prompt(fire, cwd):
    assert fire("SessionStart", at=0, cwd=cwd, source="startup")["anim"] == "ctf hoodie"
    assert fire("UserPromptSubmit", at=1, cwd=cwd, prompt="next flag")["anim"] == "ctf hoodie"
    assert fire("PreToolUse", at=5, cwd=cwd, tool_name="Bash",
                tool_input={"command": "nmap -sV 10.10.11.5"})["anim"] == "echo work"


@pytest.mark.parametrize("cwd", [
    r"C:\Users\OOrte\Downloads\Temp AEGIS_Deep",
    r"C:\Users\OOrte\Downloads\Temp Clawdmeter",
    r"C:\Code\ProjectFiles",
    r"C:\Code\actfast",
])
def test_folders_that_merely_contain_the_letters_are_not_ctf(fire, cwd):
    assert fire("UserPromptSubmit", cwd=cwd)["anim"] == "echo think spin"


def test_ctf_mode_word_set_by_hand_counts_anywhere(fire):
    state.save({"agents": 0, "anim": "", "mode": "ctf"})
    assert fire("UserPromptSubmit", cwd=WORK) == {"agents": 0, "anim": "ctf hoodie", "mode": "ctf"}


# ---------------------------------------------------------------------------
# Input, errors, files
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("event", ["TeleportRequest", "PermissionRequest", "PostToolUseFailure", "", "stop"])
def test_unknown_event_is_ignored_and_writes_nothing(fire, relay_files, event):
    assert fire(event, tool_name="Read") == state.DEFAULTS
    assert not relay_files.exists()


def test_event_name_falls_back_to_the_payloads_hook_event_name(monkeypatch, capsys, clock):
    monkeypatch.setattr(sys, "stdin", _stdin(json.dumps({"hook_event_name": "Stop", "session_id": "s1"})))
    assert hooks.main([]) == 0
    assert capsys.readouterr() == ("", "")
    assert state.load()["anim"] == "job done"


def test_non_ascii_payload_is_read_as_utf8_whatever_the_code_page(monkeypatch, capsys, clock, relay_files):
    payload = {"hook_event_name": "UserPromptSubmit", "session_id": "sesión ñ", "cwd": WORK,
               "prompt": "café, naïve ✓"}
    monkeypatch.setattr(sys, "stdin", _stdin(json.dumps(payload, ensure_ascii=False), encoding="cp1252"))
    assert hooks.main(["UserPromptSubmit"]) == 0
    assert capsys.readouterr() == ("", "")
    assert state.load()["anim"] == "echo think spin"
    assert "sesión ñ" in _sidecar(relay_files)["sessions"]


@pytest.mark.parametrize("stdin", ["", "   ", "not json", "{broken", "[1, 2]", '"a string"', "null", "42"])
def test_malformed_stdin_exits_0_silently_and_writes_nothing(monkeypatch, capsys, relay_files, stdin):
    monkeypatch.setattr(sys, "stdin", _stdin(stdin))
    assert hooks.main(["UserPromptSubmit"]) == 0
    assert capsys.readouterr() == ("", "")
    assert not relay_files.exists()


def test_missing_stdin_exits_0_silently(monkeypatch, capsys, relay_files):
    monkeypatch.setattr(sys, "stdin", None)
    assert hooks.main(["Stop"]) == 0
    assert capsys.readouterr() == ("", "")
    assert not relay_files.exists()


def test_a_terminal_on_stdin_is_never_waited_on(monkeypatch, capsys, relay_files):
    class Terminal(io.StringIO):
        was_read = False

        def isatty(self):
            return True

        def read(self, *args):
            self.was_read = True
            return super().read(*args)

    term = Terminal('{"session_id": "s1"}')
    monkeypatch.setattr(sys, "stdin", term)
    assert hooks.main(["Stop"]) == 0
    assert capsys.readouterr() == ("", "")
    assert not term.was_read
    assert not relay_files.exists()


@pytest.mark.parametrize("target, name", [
    (hooks, "load_state"), (hooks, "save_state"), (hooks, "_load_sidecar"), (hooks, "handle"),
])
def test_any_error_inside_exits_0_and_prints_nothing(monkeypatch, capsys, relay_files, target, name):
    def boom(*args, **kwargs):
        raise PermissionError("the file is held open")
    monkeypatch.setattr(target, name, boom)
    monkeypatch.setattr(sys, "stdin", _stdin(json.dumps({"session_id": "s1", "prompt": "hi"})))
    assert hooks.main(["UserPromptSubmit"]) == 0
    assert capsys.readouterr() == ("", "")
    assert not (relay_files / "state.json").exists()


def test_script_run_by_claude_code_exits_0_silently_and_writes_the_state(tmp_path):
    payload = {"session_id": "s1", "cwd": WORK, "hook_event_name": "PreToolUse",
               "tool_name": "Bash", "tool_input": {"command": "ssh fox-pool uptime"}}
    r = _run_script(tmp_path, ["PreToolUse"], json.dumps(payload).encode("utf-8"))
    assert (r.returncode, r.stdout, r.stderr) == (0, b"", b"")
    written = json.loads((tmp_path / "la" / "Clawdmeter" / "state.json").read_text(encoding="utf-8"))
    assert written == {"agents": 0, "anim": "echo ssh", "mode": ""}


@pytest.mark.parametrize("args, stdin", [
    (["PreToolUse"], b"\xff\xfe not json"),
    (["PreToolUse"], b""),
    ([], b'{"hook_event_name": 7}'),
    (["NoSuchEvent"], b'{"session_id": "s1"}'),
])
def test_script_with_bad_input_exits_0_silently(tmp_path, args, stdin):
    r = _run_script(tmp_path, args, stdin)
    assert (r.returncode, r.stdout, r.stderr) == (0, b"", b"")
    assert not (tmp_path / "la").exists()


@pytest.mark.parametrize("junk", [
    b"", b"{oops", b"[1]", b'{"sessions": [1]}',
    b'{"sessions": {"s1": {"t": "x"}}, "ultra": 5, "anim_t": "no"}',
])
def test_a_damaged_sidecar_is_started_over_not_raised(fire, relay_files, junk):
    relay_files.mkdir(parents=True, exist_ok=True)
    (relay_files / "hooks.json").write_bytes(junk)
    assert fire("UserPromptSubmit")["anim"] == "echo think spin"
    assert _sidecar(relay_files)["sessions"]["s1"]["t"] == T0


def test_a_damaged_state_file_reads_as_defaults(fire, relay_files):
    relay_files.mkdir(parents=True, exist_ok=True)
    (relay_files / "state.json").write_text("{half", encoding="utf-8")
    assert fire("UserPromptSubmit") == {"agents": 0, "anim": "echo think spin", "mode": ""}


def test_nothing_is_written_when_nothing_changes(fire, monkeypatch):
    fire("PreToolUse", at=0, tool_name="Read")
    writes = []
    monkeypatch.setattr(hooks, "save_state", lambda path, s: writes.append(("state", s)))
    monkeypatch.setattr(hooks, "_write_atomic", lambda path, text, *a, **k: writes.append(("hooks", text)))
    fire("PreToolUse", at=5, tool_name="Read")
    fire("PreToolUse", at=10, tool_name="Grep")
    assert writes == []


def test_writes_leave_no_temp_files_behind(fire, relay_files):
    fire("SubagentStart", at=0, agent_id="a1")
    fire("PreToolUse", at=5, tool_name="Edit")
    fire("SubagentStop", at=6, agent_id="a1")
    fire("Stop", at=7)
    assert sorted(p.name for p in relay_files.iterdir()) == ["hooks.json", "hooks.lock", "state.json"]


def test_a_busy_lock_skips_the_run_instead_of_waiting(relay_files, monkeypatch):
    monkeypatch.setattr(hooks, "LOCK_WAIT_S", 0.05)
    relay_files.mkdir(parents=True, exist_ok=True)
    with hooks._Lock(relay_files / "hooks.lock") as held:
        assert held
        t0 = time.monotonic()
        assert hooks.handle("UserPromptSubmit", {"session_id": "s1"}, now=T0) is False
        assert time.monotonic() - t0 < 1.0
    assert state.load()["anim"] == ""
    assert hooks.handle("UserPromptSubmit", {"session_id": "s1"}, now=T0 + 1) is True
    assert state.load()["anim"] == "echo think spin"


def test_parallel_runs_do_not_lose_updates(relay_files, monkeypatch):
    """Agents that start together: the lock serialises the read, change, write."""
    monkeypatch.setattr(hooks, "LOCK_WAIT_S", 10.0)
    ids = [f"a{i}" for i in range(12)]
    barrier = threading.Barrier(len(ids))

    def start(aid):
        barrier.wait()
        hooks.handle("SubagentStart", {"session_id": "s1", "agent_id": aid}, now=T0)

    threads = [threading.Thread(target=start, args=(aid,)) for aid in ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert state.load()["agents"] == len(ids)
    assert set(_sidecar(relay_files)["sessions"]["s1"]["agents"]) == set(ids)


def test_a_write_that_cannot_land_leaves_no_temp_file(relay_files, monkeypatch):
    relay_files.mkdir(parents=True)

    def refuse(src, dst):
        raise PermissionError("held open by another process")

    monkeypatch.setattr(os, "replace", refuse)
    monkeypatch.setattr(time, "sleep", lambda s: None)      # skip the retry waits
    with pytest.raises(PermissionError):
        state.save({"agents": 1, "anim": "", "mode": ""})
    with pytest.raises(PermissionError):
        hooks.save_state(str(relay_files / "state.json"), {"agents": 1, "anim": "", "mode": ""})
    with pytest.raises(PermissionError):
        hooks._write_atomic(relay_files / "hooks.json", '{"sessions":{}}')
    assert list(relay_files.iterdir()) == []


# Loaded by the interpreter as it starts, even with -E -S: never counted.
HEAVY = ("json", "re", "enum", "functools", "collections", "pathlib", "urllib", "fnmatch",
         "ipaddress", "tempfile", "argparse", "shutil", "random", "bz2", "lzma", "clawdmeter_state")


def test_hook_imports_stay_light(tmp_path):
    """Every import is paid on every tool call: json (it brings re, enum,
    functools, collections) and pathlib (urllib, ipaddress, fnmatch) cost about
    50 ms per run together on the development machine, os, _json and msvcrt
    about 2 ms. Checked after real runs of every kind, not just the import."""
    t = _transcript(tmp_path / "t.jsonl", ("claude-opus-5", 2_000))
    probe = (
        "import sys; sys.path.insert(0, sys.argv[1]); import clawdmeter_hooks as h\n"
        "h.BASE_DIR = sys.argv[2]\n"
        "p = {'session_id': 's1', 'cwd': sys.argv[2], 'transcript_path': sys.argv[3]}\n"
        "for e, extra in [('SessionStart', {'source': 'startup'}), ('UserPromptSubmit', {}),\n"
        "                 ('PreToolUse', {'tool_name': 'Bash', 'tool_input': {'command': 'ssh h x'}}),\n"
        "                 ('SubagentStart', {'agent_id': 'a'}), ('SubagentStop', {'agent_id': 'a'}),\n"
        "                 ('Stop', {}), ('SessionEnd', {})]:\n"
        "    assert h.handle(e, dict(p, **extra))\n"
        f"print(sorted(m for m in {HEAVY!r} if m in sys.modules))\n")
    r = subprocess.run([sys.executable, *hooks.PY_FLAGS, "-c", probe, str(Path(hooks.__file__).parent),
                        str(tmp_path / "la"), t], capture_output=True, text=True, timeout=60)
    assert (r.returncode, r.stderr) == (0, "")
    assert r.stdout.strip() == "[]"


def test_one_run_is_quick(relay_files, tmp_path):
    """In process, a PreToolUse with a tail read: a few ms each. The bound is
    loose on purpose (a busy machine); the whole process is timed in the README."""
    t = _transcript(tmp_path / "t.jsonl", *[("claude-opus-5", 10_000)] * 400)
    runs = 20
    t0 = time.perf_counter()
    for i in range(runs):
        hooks.handle("PreToolUse", {"session_id": "s1", "transcript_path": t, "tool_name": "Read"},
                     now=T0 + 5 * i)
    assert (time.perf_counter() - t0) / runs < 0.1


# ---------------------------------------------------------------------------
# The settings block and the firmware names
# ---------------------------------------------------------------------------

def test_print_settings_prints_the_hooks_block_and_writes_nothing(capsys, relay_files):
    def no_writes(*args, **kwargs):
        raise AssertionError("print settings touched the disk")

    with pytest.MonkeyPatch.context() as mp:
        for target, name in [(os, "open"), (os, "replace"), (os, "rename"), (os, "mkdir"),
                             (os, "makedirs"), (tempfile, "mkstemp"), (Path, "write_text"),
                             (Path, "write_bytes"), (Path, "mkdir"), (Path, "touch")]:
            mp.setattr(target, name, no_writes)
        mp.setattr("builtins.open", no_writes)
        assert hooks.main(["--print-settings"]) == 0
    out, err = capsys.readouterr()
    assert err == ""
    block = json.loads(out)
    assert list(block) == ["hooks"]
    events = block["hooks"]
    assert set(events) == set(hooks.HANDLERS)
    for event, groups in events.items():
        (group,) = groups
        assert set(group) <= {"matcher", "hooks"}
        (handler,) = group["hooks"]
        assert handler["type"] == "command"
        assert Path(handler["command"]) == Path(hooks.hook_python())
        assert Path(handler["command"]).is_absolute()
        *flags, script, name = handler["args"]
        assert tuple(flags) == hooks.PY_FLAGS == ("-E", "-S")
        assert "-I" not in flags and "-P" not in flags   # both drop the script's folder from sys.path
        assert Path(script).is_absolute() and Path(script).samefile(hooks.__file__)
        assert name == event
        assert 0 < handler["timeout"] <= 10
        assert "if" not in handler and "shell" not in handler   # "if" off the tool events stops a hook
        assert handler.get("async", False) is (event != "SessionEnd")
    assert events["Notification"][0]["matcher"] == "idle_prompt"
    assert events["PostToolUse"][0]["matcher"] == "Agent|Task"
    assert "matcher" not in events["PreToolUse"][0]
    assert not relay_files.exists()


def test_every_name_the_hooks_can_send_is_in_the_firmware_table():
    names = _firmware_names()
    assert hooks.ANIMS <= names, sorted(hooks.ANIMS - names)
    assert all(0 < len(n) <= state.ANIM_MAX for n in hooks.ANIMS)
    # ANIMS is the whole set: finish() writes nothing outside it (tested above),
    # and every creature the handlers pick is inside it.
    picked = {hooks.THINK, hooks.WRITE, hooks.READ, hooks.WORK, hooks.SSH, hooks.CONSULT,
              hooks.LOADING, hooks.TWO_AGENTS, hooks.AGENTS_JOIN, hooks.ULTRA_ENTER,
              hooks.ULTRA_WORK, hooks.JOB_DONE, hooks.BURNER, hooks.CTF}
    picked |= {anim for _, anim in hooks.MODEL_TIERS}
    picked |= {hooks.tool_anim(t, {"command": c})
               for t in ("Edit", "Read", "Bash", "PowerShell", "WebFetch", "Skill", "Other")
               for c in ("ls", "ssh host")}
    assert picked == hooks.ANIMS


def test_the_printed_command_skips_a_venv_launcher(monkeypatch, tmp_path):
    """A venv's python.exe starts a second process on every run (about 20 ms);
    the hooks need nothing from a venv, so the base interpreter is printed."""
    base = tmp_path / "python.exe"
    base.write_bytes(b"")
    monkeypatch.setattr(sys, "prefix", str(tmp_path / "venv"))
    monkeypatch.setattr(sys, "base_prefix", str(tmp_path))
    monkeypatch.setattr(sys, "_base_executable", str(base), raising=False)
    assert hooks.hook_python() == str(base)
    monkeypatch.setattr(sys, "_base_executable", str(tmp_path / "missing.exe"))
    assert hooks.hook_python() == sys.executable            # no base to be found: as it runs
    monkeypatch.setattr(sys, "prefix", sys.base_prefix)
    monkeypatch.setattr(sys, "_base_executable", str(base))
    assert hooks.hook_python() == sys.executable            # not a venv: as it runs


def test_print_settings_as_a_process_writes_nothing(tmp_path):
    r = _run_script(tmp_path, ["--print-settings"], b"")
    assert (r.returncode, r.stderr) == (0, b"")
    assert set(json.loads(r.stdout)["hooks"]) == set(hooks.HANDLERS)
    assert list(tmp_path.iterdir()) == []       # no state folder, no lock, nothing in the working folder


# ---------------------------------------------------------------------------
# Late runs: a run can get the lock after newer ones
# ---------------------------------------------------------------------------

def test_a_start_that_arrives_after_its_own_stop_does_not_revive_the_agent(fire):
    """A SubagentStart or a subagent's last tool call, held up behind the lock
    and handed it after that agent's SubagentStop: older than the stop, so the
    agent stays finished instead of counting for 15 minutes."""
    fire("SubagentStart", at=0, agent_id="a1")
    fire("SubagentStart", at=1, agent_id="a2")
    assert fire("SubagentStop", at=10, agent_id="a2")["agents"] == 1
    assert fire("SubagentStart", at=9.5, agent_id="a2")["agents"] == 1
    assert fire("PreToolUse", at=9.8, agent_id="a2", tool_name="Read")["agents"] == 1
    assert fire("SubagentStop", at=12, agent_id="a1") == {"agents": 0, "anim": "agents join", "mode": ""}


def test_an_agent_woken_after_its_stop_counts_again(fire):
    """SendMessage can wake a finished agent under the same id: newer than its
    stop, so it counts."""
    fire("SubagentStart", at=0, agent_id="a1")
    assert fire("SubagentStop", at=10, agent_id="a1")["agents"] == 0
    assert fire("SubagentStart", at=15, agent_id="a1")["agents"] == 1
    assert fire("PreToolUse", at=16, agent_id="a1", tool_name="Read")["agents"] == 1
    assert fire("SubagentStop", at=30, agent_id="a1")["agents"] == 0


def test_a_stop_is_remembered_only_briefly(fire, relay_files):
    fire("SubagentStart", at=0, agent_id="a1")
    fire("SubagentStop", at=10, agent_id="a1")
    assert "gone" in _sidecar(relay_files)["sessions"]["s1"]
    fire("UserPromptSubmit", at=10 + hooks.GONE_KEEP_S + 1)
    assert "gone" not in _sidecar(relay_files)["sessions"]["s1"]


def test_a_late_run_keeps_its_bookkeeping_but_not_its_creature(fire):
    fire("PreToolUse", at=0, tool_name="Edit")
    assert fire("Stop", at=10) == {"agents": 0, "anim": "job done", "mode": "done"}
    # a tool call raised before the Stop, handed the lock after it
    assert fire("PreToolUse", at=9, tool_name="Read") == {"agents": 0, "anim": "job done", "mode": "done"}
    assert fire("UserPromptSubmit", at=20) == {"agents": 0, "anim": "echo think spin", "mode": ""}
    # a late SubagentStart still counts, it just shows nothing
    assert fire("SubagentStart", at=19, agent_id="late") == {"agents": 1, "anim": "echo think spin", "mode": ""}


def test_session_end_always_clears_even_if_it_looks_older_than_stop(fire):
    """claude -p: Stop (in the background) and SessionEnd come milliseconds
    apart, and Python's start time varies more than that, so SessionEnd can
    carry the older time. Its clear must land anyway: nothing comes after it."""
    fire("PreToolUse", at=0, tool_name="Edit")
    assert fire("Stop", at=10)["anim"] == "job done"
    assert fire("SessionEnd", at=9.9) == {"agents": 0, "anim": "", "mode": ""}


def test_a_burst_of_agent_hooks_counts_every_one(tmp_path):
    """A workflow launching many agents at once: every SubagentStart and every
    SubagentStop is its own process, all started together. With a 0.25 s lock
    wait, 30 at once counted 5 to 10 and left phantoms behind."""
    n = 16
    env = dict(os.environ, LOCALAPPDATA=str(tmp_path / "la"))

    def burst(event):
        procs = [subprocess.Popen([sys.executable, *hooks.PY_FLAGS, hooks.__file__, event],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  env=env, cwd=str(tmp_path)) for _ in range(n)]
        for i, p in enumerate(procs):
            p.stdin.write(json.dumps({"session_id": "s1", "agent_id": f"a{i}"}).encode("utf-8"))
            p.stdin.close()
        for p in procs:
            assert (p.wait(timeout=60), p.stdout.read(), p.stderr.read()) == (0, b"", b"")
            p.stdout.close()
            p.stderr.close()
        return json.loads((tmp_path / "la" / "Clawdmeter" / "state.json").read_text(encoding="utf-8"))

    assert burst("SubagentStart")["agents"] == n
    assert burst("SubagentStop")["agents"] == 0


def test_the_script_needs_no_other_file(tmp_path):
    """Copied on its own, the hook still runs, silently. (It used to import
    clawdmeter_state; without it, it printed a traceback and exited 1.)"""
    lonely = tmp_path / "lonely"
    lonely.mkdir()
    copy = lonely / "clawdmeter_hooks.py"
    copy.write_bytes(Path(hooks.__file__).read_bytes())
    env = dict(os.environ, LOCALAPPDATA=str(tmp_path / "la"))
    r = subprocess.run([sys.executable, *hooks.PY_FLAGS, str(copy), "PreToolUse"],
                       input=json.dumps({"session_id": "s1", "tool_name": "Read"}).encode("utf-8"),
                       capture_output=True, env=env, cwd=str(tmp_path), timeout=60)
    assert (r.returncode, r.stdout, r.stderr) == (0, b"", b"")
    written = json.loads((tmp_path / "la" / "Clawdmeter" / "state.json").read_text(encoding="utf-8"))
    assert written == {"agents": 0, "anim": "echo read", "mode": ""}


def test_an_import_that_fails_still_exits_0_silently(tmp_path):
    """Whatever breaks while the script loads, Claude Code sees exit 0 and no output."""
    probe = ("import sys, runpy; sys.modules['msvcrt'] = None; sys.modules['fcntl'] = None; "
             "sys.argv = [sys.argv[1], 'PreToolUse']; runpy.run_path(sys.argv[0], run_name='__main__')")
    r = subprocess.run([sys.executable, *hooks.PY_FLAGS, "-c", probe, hooks.__file__],
                       input=b'{"session_id": "s1", "tool_name": "Read"}', capture_output=True,
                       env=dict(os.environ, LOCALAPPDATA=str(tmp_path / "la")), timeout=60)
    assert (r.returncode, r.stdout, r.stderr) == (0, b"", b"")


# ---------------------------------------------------------------------------
# The plain string matchers and the lean JSON against their references
# ---------------------------------------------------------------------------

SSH_REF = re.compile(r"(?<![\w.-])(?:ssh|scp|sftp)(?:\.exe)?\s", re.IGNORECASE)
CTF_REF = re.compile(r"(?<![a-z])ctf|ctf(?![a-z])|(?<![a-z])htb|hackthebox|holmes", re.IGNORECASE)
PIECES = ["ssh", "scp", "sftp", ".exe", "ctf", "htb", "hackthebox", "holmes", "HackTheBox", "CTF",
          "SSH", "Sftp", "x", "a", "d", "z", "7", "_", " ", "\t", "\n", "-", ".", "/", "\\", ":", "@",
          "'", '"', "é", "\u00a0", "\u2003", "open", "picoCTF", "EXE", "ss", "h", "ct", "f", "ht", "b"]


def _corpus():
    rnd = random.Random(973)
    yield from ["", "ssh", "ssh ", "ctf", "htb", "xctfx", "xhtb", "htbx"]
    for _ in range(30_000):
        yield "".join(rnd.choice(PIECES) for _ in range(rnd.randint(1, 7)))


def test_ssh_matcher_answers_as_the_regex_did():
    for s in _corpus():
        assert hooks._runs_ssh(s) == bool(SSH_REF.search(s)), repr(s)


def test_ctf_matcher_answers_as_the_regex_did():
    for s in _corpus():
        assert hooks._is_ctf(s) == bool(CTF_REF.search(s)), repr(s)


JSON_TEXTS = [
    '{"a": 1}', ' {"a": [1, 2.5, "x", null, true, false], "b": {"c": -0.0}} \n', '"s"', "42", "-7",
    "1e400", "NaN", '{"a": -Infinity}', '{"k": "caf\\u00e9 \\ud83d\\ude00"}', '"\\ud800"', "", "   ",
    "{", '{"a": 1} x', "[1,]", '{"a" 1}', '"tab\there"', "[1, 2]\n\n", "tru", '{"a":1}{"b":2}',
]


@pytest.mark.parametrize("text", JSON_TEXTS)
def test_lean_json_reads_what_json_reads(text):
    def outcome(fn, data):
        try:
            return repr(fn(data))
        except ValueError:
            return "ValueError"
    for data in (text, text.encode("utf-8")):
        assert outcome(hooks._loads, data) == outcome(json.loads, data)


@pytest.mark.parametrize("raw", [
    "\ufeff{\"agents\": 2}".encode("utf-8"), '{"agents": 3, "mode": "ctf"}'.encode("utf-16"),
    '{"mode": "caf\u00e9"}'.encode("utf-16-le"), '{"agents": 1}'.encode("utf-16-le"),
    '{"agents": 1}'.encode("utf-16-be"), '{"agents": 1}'.encode("utf-32"), '[5]'.encode("utf-32-le"),
    b"\xff\xfe\x00junk", b'{"a": "\xe9"}', b"\x00",
])
def test_lean_json_hands_other_encodings_to_json(raw):
    def outcome(fn):
        try:
            return repr(fn(raw))
        except ValueError:
            return "ValueError"
    assert outcome(hooks._loads) == outcome(json.loads)


@pytest.mark.parametrize("obj", [
    {"agents": 0, "anim": "", "mode": ""}, {"agents": 3, "anim": "echo ssh", "mode": "ctf ultracode"},
    {"sessions": {"s\u00f1": {"t": 1800000000.125, "agents": {"a1": 1.5}, "burn": {"on": True, "hi": 0.0}}},
     "ultra": {"sid": "s1", "since": 1.0, "seen": None}, "anim_t": 1800000003.0000002},
    {"z": 1, "a": [1, 2, {"y": "\u2713", "b": None}]},
])
def test_lean_json_writes_what_json_writes(obj):
    assert hooks._dumps(obj) == json.dumps(obj)
    assert hooks._dumps(obj, sort=True) == json.dumps(obj, sort_keys=True, separators=(",", ":"))
    assert json.loads(hooks._dumps(obj, sort=True)) == obj


@pytest.mark.parametrize("raw", [
    b'{"agents": 2, "anim": "echo read", "mode": "ctf"}', b'{"agents": true, "anim": 5, "mode": null}',
    b'{"agents": -1, "anim": "' + b"x" * 24 + b'", "mode": "m"}', b'{"agents": 1.0}',
    b'{"agents": 99999999999999999999, "anim": "' + b"y" * 23 + b'"}', b"[1, 2]", b"", b"{half", b"null",
    "\ufeff{\"agents\": 1, \"mode\": \"ctf\"}".encode("utf-8"), '{"agents": 3, "mode": "ctf"}'.encode("utf-16"),
    '{"agents": 5, "mode": "ctf"}'.encode("utf-16-le"),
    b'{"agents": 4, "anim": "echo work", "mode": "done", "extra": [1]}', None,
])
def test_hooks_read_state_json_exactly_as_clawdmeter_state_does(relay_files, raw):
    relay_files.mkdir(parents=True, exist_ok=True)
    path = relay_files / "state.json"
    if raw is not None:
        path.write_bytes(raw)
    assert hooks.load_state(str(path)) == state.load()


def test_hooks_write_state_json_as_clawdmeter_state_does(relay_files):
    st = {"agents": 2, "anim": "echo write", "mode": "ctf caf\u00e9"}
    state.save(st)
    by_cli = (relay_files / "state.json").read_bytes()
    hooks.save_state(str(relay_files / "state.json"), st)
    assert (relay_files / "state.json").read_bytes() == by_cli


# ---------------------------------------------------------------------------
# The transcript tail: bounded, and a file still being written is fine
# ---------------------------------------------------------------------------

class _HugeTranscript:
    """A 200 MB transcript that is only arithmetic: filler lines, then `tail`.
    Counts every byte it hands out."""
    FILLER = json.dumps({"type": "user", "message": {"role": "user", "content": "x" * 70}}).encode() + b"\n"

    def __init__(self, tail: bytes, size: int = 200 * 1024 * 1024):
        body = (size - len(tail)) // len(self.FILLER) * len(self.FILLER)   # whole filler lines
        self.tail, self.size, self.pos, self.handed = tail, body + len(tail), 0, 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.size + off
        return self.pos

    def read(self, n=-1):
        a, b = self.pos, self.size if n < 0 else min(self.size, self.pos + n)
        body, out = self.size - len(self.tail), b""
        if a < body:
            first = a - a % len(self.FILLER)
            reps = (min(b, body) - first) // len(self.FILLER) + 2
            out += (self.FILLER * reps)[a - first:min(b, body) - first]
        if b > body:
            out += self.tail[max(a, body) - body:b - body]
        self.pos, self.handed = b, self.handed + len(out)
        return out


@pytest.mark.parametrize("gap, expected", [
    (0, ("claude-opus-5", 2_000)),                   # the newest reply in the first window
    (500_000, ("claude-opus-5", 2_000)),             # half a megabyte of tool output after it
    (1_500_000, (None, None)),                       # further back than the last window reaches
])
def test_a_200_mb_transcript_is_never_read_whole(monkeypatch, gap, expected):
    tail = json.dumps(_reply("claude-opus-5", 2_000)).encode() + b"\n"
    if gap:
        tail += json.dumps({"type": "user", "message": {"role": "user", "content": "y" * gap}}).encode() + b"\n"
    huge = _HugeTranscript(tail)
    monkeypatch.setattr(hooks, "open", lambda path, mode="r": huge, raising=False)
    assert hooks.read_tail("C:/huge.jsonl") == expected
    assert huge.handed <= sum(hooks.TAIL_BYTES)


def test_a_transcript_still_being_written_gives_the_last_complete_reply(tmp_path):
    path = tmp_path / "t.jsonl"
    _transcript(path, ("claude-sonnet-4-6", 1_000), ("claude-opus-5", 2_000))
    with open(path, "a", encoding="utf-8") as f:     # a reply cut mid line, no newline yet
        f.write(json.dumps(_reply("claude-haiku-4-5", 9_999))[:60])
    assert hooks.read_tail(str(path)) == ("claude-opus-5", 2_000)


def test_a_pathological_line_is_skipped_not_raised(tmp_path):
    """Nesting deeper than the recursion limit raises RecursionError, not ValueError."""
    path = tmp_path / "t.jsonl"
    _transcript(path, ("claude-opus-5", 2_000))
    with open(path, "a", encoding="utf-8") as f:      # the newest line: nested past the limit
        f.write('{"type": "assistant", "x": ' + "[" * 5_000 + "]" * 5_000 + "}\n")
    assert hooks.read_tail(str(path)) == ("claude-opus-5", 2_000)
    with open(path, "ab") as f:                       # newer still: a line that is not UTF 8 at all
        f.write(b'{"type": "assistant", "message": {"model": "\xff\xfe"}}\n')
    assert hooks.read_tail(str(path)) == ("claude-opus-5", 2_000)
