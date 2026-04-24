import fs from "node:fs";
import path from "node:path";

const DEFAULT_WIDTH = 88;
const DEFAULT_TOOL_ROWS = 5;
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
};

export function renderTerminalHud(status, options = {}) {
  const color = options.color !== false;
  const width = normalizeWidth(options.width);
  const context = options.context ?? {};
  const now = options.now instanceof Date ? options.now : new Date();
  const session = pickActiveSession(status);
  const toolCalls = session?.toolCalls ?? [];
  const completedTools = toolCalls.filter((call) => call.status !== "running").length;
  const totalTools = toolCalls.length;
  const progressPercent = totalTools > 0 ? Math.round((completedTools / totalTools) * 100) : 100;
  const model = context.model || options.model || "Codex";
  const statusParts = buildStatusParts({ context, session, now });
  const summary = buildSummary({ session, toolCalls, completedTools, totalTools, color });
  const maxToolRows = options.maxToolRows ?? (options.compact ? 3 : DEFAULT_TOOL_ROWS);
  const recentCalls = toolCalls.slice(-maxToolRows);

  const lines = [
    `${paint(`[${model}]`, "cyan", color)} ${renderProgressBar(progressPercent, { color })} ${paint(
      `${progressPercent}%`,
      "green",
      color,
    )}${statusParts.length ? ` | ${statusParts.join(" | ")}` : ""}`,
    summary,
    ...recentCalls.map((call) => renderToolCall(call, { color, now })),
  ];

  if (recentCalls.length === 0) {
    lines.push(paint("· No tool activity captured yet", "dim", color));
  }

  return lines.map((line) => fitLine(line, width)).join("\n");
}

export function collectTerminalContext(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env ?? process.env;

  return {
    model: env.CODEX_HUD_MODEL || env.CODEX_MODEL || env.CLAUDE_MODEL || "Codex",
    instructionFiles: countExistingFiles(cwd, ["AGENTS.md", "CLAUDE.md"]),
    rules: countFilesInDirectories(cwd, ["rules", path.join(".codex", "rules")]),
    mcps: countExistingFiles(cwd, [".mcp.json", "mcp.json"]),
    hooks: countHookFiles(cwd),
  };
}

export function stripAnsi(value) {
  return String(value || "").replace(ANSI_PATTERN, "");
}

function pickActiveSession(status) {
  if (!status || typeof status !== "object") {
    return undefined;
  }

  const sessions = Array.isArray(status.sessions) ? status.sessions : [];
  return (
    sessions.find((session) => session.sessionId === status.activeSessionId) ||
    sessions.find((session) => session.status !== "ended") ||
    sessions[0]
  );
}

function buildStatusParts({ context, session, now }) {
  const parts = [];

  if (Number.isFinite(context.instructionFiles) && context.instructionFiles > 0) {
    parts.push(`${context.instructionFiles} context`);
  }

  if (Number.isFinite(context.rules)) {
    parts.push(`${context.rules} rules`);
  }

  if (Number.isFinite(context.mcps)) {
    parts.push(`${context.mcps} MCPs`);
  }

  if (Number.isFinite(context.hooks)) {
    parts.push(`${context.hooks} hooks`);
  }

  if (session?.startedAt) {
    parts.push(`◷ ${formatElapsed(session.startedAt, now)}`);
  }

  return parts;
}

function buildSummary({ session, toolCalls, completedTools, totalTools, color }) {
  if (!session) {
    return paint("· Waiting for Codex hook events", "dim", color);
  }

  const runningTools = toolCalls.filter((call) => call.status === "running").length;
  const failedTools = toolCalls.filter((call) => call.status === "failed").length;

  if (totalTools === 0) {
    return paint(`· Session ${session.status || "running"} · ${session.eventCount || 0} events`, "dim", color);
  }

  if (failedTools > 0) {
    return `${paint("✗", "red", color)} ${failedTools} failed | ${completedTools}/${totalTools} tools complete`;
  }

  if (runningTools > 0) {
    return `${paint("●", "cyan", color)} ${runningTools} running | ${completedTools}/${totalTools} tools complete`;
  }

  return `${paint("✓", "green", color)} All tools complete (${completedTools}/${totalTools})`;
}

function renderToolCall(call, options) {
  const color = options.color;
  const statusStyle = statusToStyle(call.status);
  const icon = statusToIcon(call.status);
  const duration = formatCallDuration(call, options.now);
  const detail = call.status === "failed" ? call.errorMessage : call.inputSummary || call.outputSummary;
  const detailText = detail ? ` · ${detail}` : "";

  return `${paint(icon, statusStyle, color)} ${paint(call.toolName || "unknown", "magenta", color)}${duration}${detailText}`;
}

function renderProgressBar(percent, options) {
  const total = 6;
  const active = Math.max(0, Math.min(total, Math.round((percent / 100) * total)));
  const bar = `${"█".repeat(active)}${"░".repeat(total - active)}`;
  return paint(bar, percent >= 100 ? "green" : "cyan", options.color);
}

function formatCallDuration(call, now) {
  if (Number.isFinite(call.durationMs)) {
    return ` ${formatDuration(call.durationMs)}`;
  }

  if (call.status === "running" && call.startedAt) {
    return ` ${formatElapsed(call.startedAt, now)}`;
  }

  return "";
}

function statusToIcon(status) {
  if (status === "succeeded") return "✓";
  if (status === "failed") return "✗";
  if (status === "running") return "●";
  return "·";
}

function statusToStyle(status) {
  if (status === "succeeded") return "green";
  if (status === "failed") return "red";
  if (status === "running") return "cyan";
  return "dim";
}

function paint(value, style, color) {
  if (!color) return value;
  return `${COLORS[style] || ""}${value}${COLORS.reset}`;
}

function fitLine(line, width) {
  const text = String(line || "");
  const visible = stripAnsi(text);
  if (visible.length <= width) return text;

  if (visible.length === text.length) {
    return `${text.slice(0, Math.max(0, width - 1))}…`;
  }

  return text;
}

function formatElapsed(startedAt, now) {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return "?";
  return formatDuration(Math.max(0, now.getTime() - started));
}

function formatDuration(durationMs) {
  const seconds = Math.round(Number(durationMs || 0) / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

function normalizeWidth(width) {
  const parsed = Number(width);
  if (!Number.isFinite(parsed)) return DEFAULT_WIDTH;
  return Math.max(40, Math.min(160, Math.round(parsed)));
}

function countExistingFiles(cwd, relativePaths) {
  return relativePaths.filter((relativePath) => safeStat(path.join(cwd, relativePath))?.isFile()).length;
}

function countHookFiles(cwd) {
  let total = countExistingFiles(cwd, ["hooks.json"]);
  const pluginsDir = path.join(cwd, "plugins");
  const pluginEntries = safeReadDirectory(pluginsDir);

  for (const pluginEntry of pluginEntries) {
    if (!pluginEntry.isDirectory()) continue;
    if (safeStat(path.join(pluginsDir, pluginEntry.name, "hooks.json"))?.isFile()) {
      total += 1;
    }
  }

  return total;
}

function countFilesInDirectories(cwd, relativeDirectories) {
  let total = 0;

  for (const relativeDirectory of relativeDirectories) {
    const directory = path.join(cwd, relativeDirectory);
    for (const entry of safeReadDirectory(directory)) {
      if (entry.isFile()) total += 1;
    }
  }

  return total;
}

function safeReadDirectory(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return undefined;
  }
}
