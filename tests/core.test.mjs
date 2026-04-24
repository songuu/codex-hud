import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendEvent,
  createHudEvent,
  parseHookPayload,
  readEvents,
  reduceEvents,
  summarizeValue,
} from "../plugins/codex-hud/src/core/index.mjs";

test("createHudEvent normalizes hook payload and redacts secrets", () => {
  const { payload } = parseHookPayload(
    JSON.stringify({
      tool_name: "shell_command",
      tool_call_id: "call-1",
      input: {
        command: "echo hello",
        api_key: "super-secret-key",
      },
    }),
  );

  const event = createHudEvent({
    phase: "PreToolUse",
    payload,
    cwd: "/tmp/project",
    env: { CODEX_SESSION_ID: "session-1" },
    now: new Date("2026-04-24T01:02:03.000Z"),
  });

  assert.equal(event.phase, "pre-tool");
  assert.equal(event.sessionId, "session-1");
  assert.equal(event.toolName, "shell_command");
  assert.equal(event.toolStatus, "started");
  assert.equal(event.toolCallId, "call-1");
  assert.match(event.inputSummary, /api_key/);
  assert.doesNotMatch(event.inputSummary, /super-secret-key/);
});

test("summarizeValue handles non-json values and length limits", () => {
  const summary = summarizeValue({ token: "abcdef123456", text: "x".repeat(100) }, 40);

  assert.ok(summary.length <= 40);
  assert.doesNotMatch(summary, /abcdef123456/);
});

test("appendEvent and readEvents persist JSONL events by session", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-"));
  const event = createHudEvent({
    phase: "session-start",
    payload: {},
    cwd: tempDir,
    env: { CODEX_SESSION_ID: "store-session" },
    now: new Date("2026-04-24T01:00:00.000Z"),
  });

  const filePath = appendEvent(event, { cwd: tempDir, env: { CODEX_HUD_HOME: tempDir } });
  const events = readEvents({ cwd: tempDir, env: { CODEX_HUD_HOME: tempDir } });

  assert.equal(path.basename(filePath), "store-session.jsonl");
  assert.equal(events.length, 1);
  assert.equal(events[0].sessionId, "store-session");
});

test("fallback session id is stable across hook processes for a workspace", () => {
  const first = createHudEvent({
    phase: "pre-tool",
    payload: { tool_name: "first" },
    cwd: "/tmp/project",
    env: {},
    now: new Date("2026-04-24T01:00:00.000Z"),
  });
  const second = createHudEvent({
    phase: "post-tool",
    payload: { tool_name: "first" },
    cwd: "/tmp/project",
    env: {},
    now: new Date("2026-04-24T01:00:01.000Z"),
  });

  assert.equal(first.sessionId, second.sessionId);
  assert.match(first.sessionId, /^local-/);
});

test("reduceEvents pairs pre and post tool events", () => {
  const pre = createHudEvent({
    phase: "pre-tool",
    payload: { tool_name: "shell_command", tool_call_id: "call-1" },
    cwd: "/tmp/project",
    env: { CODEX_SESSION_ID: "session-1" },
    now: new Date("2026-04-24T01:00:00.000Z"),
  });
  const post = createHudEvent({
    phase: "post-tool",
    payload: {
      tool_name: "shell_command",
      tool_call_id: "call-1",
      output: "done",
    },
    cwd: "/tmp/project",
    env: { CODEX_SESSION_ID: "session-1" },
    now: new Date("2026-04-24T01:00:02.000Z"),
  });

  const status = reduceEvents([post, pre]);
  const session = status.sessions[0];

  assert.equal(status.sessionCount, 1);
  assert.equal(session.toolCalls.length, 1);
  assert.equal(session.toolCalls[0].status, "succeeded");
  assert.equal(session.toolCalls[0].durationMs, 2000);
});
