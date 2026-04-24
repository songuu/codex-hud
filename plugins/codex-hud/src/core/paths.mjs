import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export function resolveHudHome(options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const explicitHome = env.CODEX_HUD_HOME || env.HUD_HOME;

  if (explicitHome) {
    return path.resolve(explicitHome);
  }

  return path.join(cwd, ".hud");
}

export function resolveEventsDir(options = {}) {
  return path.join(resolveHudHome(options), "events");
}

export function resolveDiagnosticsDir(options = {}) {
  return path.join(resolveHudHome(options), "diagnostics");
}

export function resolveSessionId(options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const explicitSessionId =
    env.CODEX_HUD_SESSION_ID ||
    env.CODEX_SESSION_ID ||
    env.CLAUDE_SESSION_ID ||
    env.SESSION_ID;

  if (explicitSessionId) {
    return sanitizeFilePart(String(explicitSessionId));
  }

  // Codex hook processes may not share a parent pid, so the fallback must be
  // stable across separate hook invocations from the same workspace.
  return `local-${sha256Short(cwd)}`;
}

export function detectProject(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  return {
    id: sha256Short(cwd),
    name: path.basename(cwd) || "workspace",
    cwd,
    platform: os.platform(),
  };
}

export function sanitizeFilePart(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96) || "unknown";
}

function sha256Short(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}
