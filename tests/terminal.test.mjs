import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHudEvent, reduceEvents } from "../plugins/codex-hud/src/core/index.mjs";
import {
  collectTerminalContext,
  renderTerminalHud,
  stripAnsi,
} from "../plugins/codex-hud/src/terminal/claude-style.mjs";

test("renderTerminalHud emits Claude-style progress and tool rows", () => {
  const pre = createHudEvent({
    phase: "pre-tool",
    payload: {
      tool_name: "shell_command",
      tool_call_id: "call-1",
      input: { command: "npm test" },
    },
    cwd: "/tmp/project",
    env: { CODEX_SESSION_ID: "terminal-session" },
    now: new Date("2026-04-24T01:00:00.000Z"),
  });
  const post = createHudEvent({
    phase: "post-tool",
    payload: {
      tool_name: "shell_command",
      tool_call_id: "call-1",
      output: "pass",
    },
    cwd: "/tmp/project",
    env: { CODEX_SESSION_ID: "terminal-session" },
    now: new Date("2026-04-24T01:00:02.000Z"),
  });

  const status = reduceEvents([pre, post]);
  const output = renderTerminalHud(status, {
    color: false,
    context: { model: "Opus 4.5", instructionFiles: 1, rules: 8, mcps: 6, hooks: 6 },
    now: new Date("2026-04-24T01:01:00.000Z"),
    width: 120,
  });

  assert.match(output, /^\[Opus 4\.5\]/);
  assert.match(output, /100%/);
  assert.match(output, /1 context \| 8 rules \| 6 MCPs \| 6 hooks/);
  assert.match(output, /✓ All tools complete \(1\/1\)/);
  assert.match(output, /shell_command 2s/);
  assert.equal(stripAnsi(output), output);
});

test("renderTerminalHud summarizes running and failed tools", () => {
  const running = createHudEvent({
    phase: "pre-tool",
    payload: { tool_name: "read_file", tool_call_id: "call-1" },
    cwd: "/tmp/project",
    env: { CODEX_SESSION_ID: "terminal-session" },
    now: new Date("2026-04-24T01:00:00.000Z"),
  });
  const failed = createHudEvent({
    phase: "post-tool",
    payload: {
      tool_name: "shell_command",
      tool_call_id: "call-2",
      is_error: true,
      error: "boom",
    },
    cwd: "/tmp/project",
    env: { CODEX_SESSION_ID: "terminal-session" },
    now: new Date("2026-04-24T01:00:01.000Z"),
  });

  const output = renderTerminalHud(reduceEvents([running, failed]), {
    color: false,
    context: { model: "Codex" },
    now: new Date("2026-04-24T01:00:03.000Z"),
  });

  assert.match(output, /50%/);
  assert.match(output, /✗ 1 failed \| 1\/2 tools complete/);
  assert.match(output, /● read_file 3s/);
  assert.match(output, /✗ shell_command · boom/);
});

test("collectTerminalContext counts local prompt, rule, MCP, and hook files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-terminal-"));
  fs.mkdirSync(path.join(tempDir, "rules"));
  fs.mkdirSync(path.join(tempDir, ".codex", "rules"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "plugins", "codex-hud"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# agents\n");
  fs.writeFileSync(path.join(tempDir, ".mcp.json"), "{}\n");
  fs.writeFileSync(path.join(tempDir, "rules", "architecture.md"), "# architecture\n");
  fs.writeFileSync(path.join(tempDir, ".codex", "rules", "testing.md"), "# testing\n");
  fs.writeFileSync(path.join(tempDir, "plugins", "codex-hud", "hooks.json"), "{}\n");

  const context = collectTerminalContext({
    cwd: tempDir,
    env: { CODEX_HUD_MODEL: "Opus 4.5" },
  });

  assert.equal(context.model, "Opus 4.5");
  assert.equal(context.instructionFiles, 1);
  assert.equal(context.rules, 2);
  assert.equal(context.mcps, 1);
  assert.equal(context.hooks, 1);
});

test("collectTerminalContext reads Codex global config for key runtime state", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-runtime-"));
  const homeDir = path.join(tempDir, "home");
  const hudHome = path.join(tempDir, "state", "codex-hud");
  fs.mkdirSync(path.join(homeDir, ".codex"), { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, ".codex", "config.toml"),
    [
      'model = "gpt-5.5"',
      'model_reasoning_effort = "xhigh"',
      'service_tier = "fast"',
      "",
      `[projects.'${tempDir}']`,
      'trust_level = "trusted"',
      "",
      "[windows]",
      'sandbox = "elevated"',
      "",
      "[mcp_servers.figma]",
      'url = "https://mcp.figma.com/mcp"',
      "",
      '[plugins."tech-persistence@local-plugins"]',
      "enabled = true",
      "",
      '[plugins."codex@openai-codex"]',
      "enabled = false",
      "",
      '[plugins."compound-engineering@compound-engineering-plugin"]',
      "enabled = true",
      "",
    ].join("\n"),
  );

  const context = collectTerminalContext({
    cwd: tempDir,
    env: {
      CODEX_HUD_HOME: hudHome,
      USERPROFILE: homeDir,
    },
  });

  assert.equal(context.model, "gpt-5.5 xhigh fast");
  assert.equal(context.projectTrust, "trusted");
  assert.equal(context.sandbox, "elevated");
  assert.equal(context.mcps, 1);
  assert.equal(context.plugins, 2);
  assert.equal(context.hudHome, hudHome);
  assert.equal(context.eventFiles, 0);
});

test("renderTerminalHud shows diagnostic runtime state when hook events are absent", () => {
  const output = renderTerminalHud(
    { eventCount: 0, sessionCount: 0, sessions: [] },
    {
      color: false,
      context: {
        cwd: "C:\\project\\my\\hud",
        eventFiles: 0,
        hooks: 10,
        hudHome: "C:\\Users\\songyu\\AppData\\Local\\codex-hud",
        mcps: 1,
        model: "gpt-5.5 xhigh fast",
        plugins: 2,
        projectTrust: "trusted",
        rules: 2,
        sandbox: "elevated",
      },
      width: 180,
    },
  );

  assert.match(output, /^\[gpt-5\.5 xhigh fast\]/);
  assert.match(output, /trusted \| elevated/);
  assert.match(output, /1 MCP \| 2 plugins \| 10 hooks \| 0 events/);
  assert.match(output, /Waiting for Codex hook events/);
  assert.match(output, /store C:\\Users\\songyu\\AppData\\Local\\codex-hud/);
  assert.match(output, /cwd C:\\project\\my\\hud/);
});

test("renderTerminalHud splits dense status details instead of truncating key fields", () => {
  const output = renderTerminalHud(
    { eventCount: 0, sessionCount: 0, sessions: [] },
    {
      color: false,
      context: {
        hooks: 10,
        mcps: 1,
        model: "gpt-5.5 xhigh fast",
        plugins: 3,
        projectTrust: "trusted",
        rules: 0,
        sandbox: "elevated",
      },
      width: 88,
    },
  );
  const lines = output.split("\n");

  assert.doesNotMatch(lines[0], /…/);
  assert.match(output, /0 rules \| 1 MCP \| 3 plugins \| 10 hooks \| 0 events/);
});
