#!/usr/bin/env node

import fs from "node:fs";
import { appendEvent, createHudEvent, parseHookPayload, readEvents, reduceEvents } from "../src/core/index.mjs";
import { collectTerminalContext, renderTerminalHud } from "../src/terminal/claude-style.mjs";

function main() {
  const phase = process.argv[2] || "manual";
  const rawInput = readStdin();
  const { payload, parseError } = parseHookPayload(rawInput);
  const event = createHudEvent({
    phase,
    payload,
    parseError,
    cwd: process.cwd(),
    env: process.env,
  });

  appendEvent(event, { cwd: process.cwd(), env: process.env });
  renderInlineHudIfEnabled();

  if (process.env.CODEX_HUD_DEBUG === "1") {
    process.stderr.write(`codex-hud captured ${event.phase} ${event.eventId}\n`);
  }
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function renderInlineHudIfEnabled() {
  if (!shouldRenderInline(process.env)) return;

  try {
    const cwd = process.cwd();
    const env = process.env;
    const events = readEvents({ cwd, env });
    const status = reduceEvents(events);
    const context = collectTerminalContext({ cwd, env });
    const output = renderTerminalHud(status, {
      color: process.stderr.isTTY && env.NO_COLOR !== "1",
      compact: true,
      context,
      width: Number(env.CODEX_HUD_TERMINAL_WIDTH) || process.stderr.columns,
    });

    process.stderr.write(`\n${output}\n`);
  } catch (error) {
    if (process.env.CODEX_HUD_DEBUG === "1") {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      process.stderr.write(`codex-hud inline render failed: ${message}\n`);
    }
  }
}

function shouldRenderInline(env) {
  return env.CODEX_HUD_RENDER === "inline" || env.CODEX_HUD_INLINE === "1";
}

try {
  main();
} catch (error) {
  if (process.env.CODEX_HUD_DEBUG === "1") {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`codex-hud hook failed: ${message}\n`);
  }
  process.exit(0);
}
