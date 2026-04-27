import fs from "node:fs";
import { readEvents, reduceEvents, resolveEventsDir } from "../core/index.mjs";
import { collectTerminalContext, renderTerminalHud, stripAnsi } from "../terminal/claude-style.mjs";

const DEFAULT_REFRESH_MS = 500;

export function createHudSupervisor(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env ?? process.env;
  const output = options.output || process.stdout;
  const intervalMs = normalizeInterval(options.intervalMs);
  const hudLines = normalizeHudLines(options.hudLines);
  const overlay = options.overlay !== false;
  const color = options.color ?? Boolean(output.isTTY);
  const terminalSize = () => ({
    columns: options.columns || output.columns || 88,
    rows: options.rows || output.rows || 24,
  });

  let watcher;
  let interval;
  let debounceTimer;
  let stopped = false;

  function renderNow() {
    if (stopped) return "";

    const size = terminalSize();
    const frame = createHudFrame({
      cwd,
      env,
      color,
      width: size.columns,
      maxToolRows: Math.max(1, hudLines - 2),
    });
    const outputFrame = overlay && output.isTTY
      ? renderBottomOverlay(frame, {
          columns: size.columns,
          hudLines,
          rows: size.rows,
        })
      : renderInlineFrame(frame);

    output.write(outputFrame);
    return outputFrame;
  }

  function scheduleRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderNow, 60);
  }

  function start() {
    if (stopped) return;

    fs.mkdirSync(resolveEventsDir({ cwd, env }), { recursive: true });
    renderNow();

    try {
      watcher = fs.watch(resolveEventsDir({ cwd, env }), scheduleRender);
    } catch {
      watcher = undefined;
    }

    interval = setInterval(renderNow, intervalMs);
  }

  function stop() {
    stopped = true;
    clearTimeout(debounceTimer);
    if (watcher) watcher.close();
    if (interval) clearInterval(interval);
  }

  return {
    renderNow,
    start,
    stop,
  };
}

export function createHudFrame(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env ?? process.env;
  const events = readEvents({ cwd, env });
  const status = reduceEvents(events);
  const context = {
    ...collectTerminalContext({ cwd, env }),
    ...(options.context || {}),
  };

  return renderTerminalHud(status, {
    color: options.color !== false,
    compact: true,
    context,
    maxToolRows: options.maxToolRows,
    width: options.width,
  });
}

export function renderBottomOverlay(frame, options = {}) {
  const columns = normalizeColumns(options.columns);
  const rows = normalizeRows(options.rows);
  const hudLines = normalizeHudLines(options.hudLines);
  const visibleLines = String(frame || "")
    .split(/\r?\n/)
    .slice(0, hudLines)
    .map((line) => fitPlainLine(line, columns));
  const startRow = Math.max(1, rows - hudLines + 1);
  const lines = [];

  for (let index = 0; index < hudLines; index += 1) {
    const row = startRow + index;
    const line = visibleLines[index] || "";
    lines.push(`\x1b[${row};1H\x1b[2K${line}`);
  }

  return `\x1b[s${lines.join("")}\x1b[u`;
}

export function renderInlineFrame(frame) {
  return `\n${String(frame || "")}\n`;
}

function fitPlainLine(line, columns) {
  const text = String(line || "");
  const visible = stripAnsi(text);
  if (visible.length <= columns) return text;
  if (visible.length !== text.length) return text;
  return `${text.slice(0, Math.max(0, columns - 1))}…`;
}

function normalizeColumns(columns) {
  const parsed = Number(columns);
  return Number.isFinite(parsed) ? Math.max(40, Math.round(parsed)) : 88;
}

function normalizeRows(rows) {
  const parsed = Number(rows);
  return Number.isFinite(parsed) ? Math.max(8, Math.round(parsed)) : 24;
}

function normalizeHudLines(lines) {
  const parsed = Number(lines);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(8, Math.round(parsed))) : 4;
}

function normalizeInterval(intervalMs) {
  const parsed = Number(intervalMs);
  return Number.isFinite(parsed) ? Math.max(100, Math.round(parsed)) : DEFAULT_REFRESH_MS;
}
