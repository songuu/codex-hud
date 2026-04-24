#!/usr/bin/env node

import fs from "node:fs";
import { readEvents, reduceEvents, resolveEventsDir } from "../src/core/index.mjs";
import { collectTerminalContext, renderTerminalHud } from "../src/terminal/claude-style.mjs";

const args = parseArgs(process.argv.slice(2));
const cwd = process.cwd();
const env = process.env;

if (args.once) {
  process.stdout.write(`${renderOnce()}\n`);
} else {
  watchTerminalHud();
}

function watchTerminalHud() {
  let watcher;
  let closed = false;

  const render = debounce(() => {
    if (closed) return;
    process.stdout.write("\x1b[2J\x1b[H");
    process.stdout.write(`${renderOnce()}\n`);
  }, 80);

  process.stdout.write("\x1b[?25l");
  render();

  try {
    fs.mkdirSync(resolveEventsDir({ cwd, env }), { recursive: true });
    watcher = fs.watch(resolveEventsDir({ cwd, env }), render);
  } catch (error) {
    process.stderr.write(`codex-hud terminal watch disabled: ${error.message}\n`);
  }

  const interval = setInterval(render, args.intervalMs);

  const close = () => {
    if (closed) return;
    closed = true;
    if (watcher) watcher.close();
    clearInterval(interval);
    process.stdout.write("\x1b[?25h");
    process.exit(0);
  };

  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

function renderOnce() {
  const events = readEvents({ cwd, env });
  const status = reduceEvents(events);
  const context = collectTerminalContext({ cwd, env });

  return renderTerminalHud(status, {
    color: args.color,
    context,
    width: args.width || process.stdout.columns,
  });
}

function parseArgs(argv) {
  const parsed = {
    once: false,
    color: process.stdout.isTTY,
    width: undefined,
    intervalMs: 1000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--once") {
      parsed.once = true;
    } else if (arg === "--watch") {
      parsed.once = false;
    } else if (arg === "--no-color") {
      parsed.color = false;
    } else if (arg === "--color") {
      parsed.color = true;
    } else if (arg === "--width") {
      parsed.width = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--interval-ms") {
      parsed.intervalMs = Math.max(100, Number(argv[index + 1]) || parsed.intervalMs);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return parsed;
}

function debounce(callback, delayMs) {
  let timeout;
  return () => {
    clearTimeout(timeout);
    timeout = setTimeout(callback, delayMs);
  };
}

function printHelp() {
  process.stdout.write(`Codex HUD terminal renderer

Usage:
  node plugins/codex-hud/scripts/hud-terminal.mjs [--watch]
  node plugins/codex-hud/scripts/hud-terminal.mjs --once [--no-color]

Options:
  --once             Render one Claude-style HUD block and exit.
  --watch            Keep repainting the terminal HUD when events change.
  --width <columns>  Override terminal width.
  --interval-ms <n>  Polling fallback interval in milliseconds.
  --color            Force ANSI color.
  --no-color         Disable ANSI color.
`);
}
