import crypto from "node:crypto";
import { detectProject, resolveSessionId } from "./paths.mjs";

const PHASE_ALIASES = new Map([
  ["sessionstart", "session-start"],
  ["session-start", "session-start"],
  ["start", "session-start"],
  ["pretooluse", "pre-tool"],
  ["pre-tool", "pre-tool"],
  ["pre", "pre-tool"],
  ["posttooluse", "post-tool"],
  ["post-tool", "post-tool"],
  ["post", "post-tool"],
  ["stop", "stop"],
  ["sessionend", "session-end"],
  ["session-end", "session-end"],
  ["end", "session-end"],
]);

const SECRET_PATTERNS = [
  {
    pattern: /(authorization\s*[:=]\s*)(bearer\s+)?[a-zA-Z0-9._~+/=-]{8,}/gi,
    replacement: "$1[REDACTED]",
  },
  {
    pattern: /((api[_-]?key|token|access[_-]?token|refresh[_-]?token|password|secret)\s*["']?\s*[:=]\s*["']?)[^"',\s}]{3,}/gi,
    replacement: "$1[REDACTED]",
  },
  {
    pattern: /(sk-[a-zA-Z0-9]{8,})/g,
    replacement: "sk-[REDACTED]",
  },
];

export function normalizePhase(input) {
  const key = String(input || "").trim().toLowerCase();
  return PHASE_ALIASES.get(key) || "manual";
}

export function parseHookPayload(input) {
  const rawInput = String(input || "").trim();

  if (!rawInput) {
    return { payload: {}, rawLength: 0, parseError: undefined };
  }

  try {
    return {
      payload: JSON.parse(rawInput),
      rawLength: rawInput.length,
      parseError: undefined,
    };
  } catch (error) {
    return {
      payload: { raw: summarizeValue(rawInput, 500) },
      rawLength: rawInput.length,
      parseError: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}

export function createHudEvent(options) {
  const phase = normalizePhase(options.phase);
  const payload = isRecord(options.payload) ? options.payload : {};
  const env = options.env ?? process.env;
  const cwd = String(options.cwd || payload.cwd || process.cwd());
  const now = options.now instanceof Date ? options.now : new Date();
  const errorMessage = pickErrorMessage(payload);
  const toolName = pickToolName(payload);
  const toolStatus = deriveToolStatus(phase, payload, errorMessage);
  const toolCallId = pickFirstString(payload, [
    "tool_call_id",
    "toolCallId",
    "call_id",
    "callId",
    "id",
  ]);

  return dropUndefined({
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    timestamp: now.toISOString(),
    source: "codex-hook",
    phase,
    sessionId: resolveSessionId({ cwd, env }),
    cwd,
    project: detectProject({ cwd }),
    toolCallId,
    toolName,
    toolStatus,
    durationMs: pickDurationMs(payload),
    inputSummary: summarizeValue(
      payload.input ?? payload.tool_input ?? payload.toolInput ?? payload.parameters,
      600,
    ),
    outputSummary: summarizeValue(
      payload.output ?? payload.tool_output ?? payload.toolOutput ?? payload.result,
      800,
    ),
    errorMessage: summarizeValue(errorMessage, 500),
    metadata: buildMetadata(payload, options.parseError),
  });
}

export function summarizeValue(value, maxLength = 500) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = typeof value === "string" ? value : safeStringify(value);
  const compactText = text.replace(/\s+/g, " ").trim();
  const redacted = redactSensitiveText(compactText);

  if (redacted.length <= maxLength) {
    return redacted;
  }

  return `${redacted.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function redactSensitiveText(text) {
  let redacted = String(text || "");
  for (const secretPattern of SECRET_PATTERNS) {
    redacted = redacted.replace(secretPattern.pattern, secretPattern.replacement);
  }
  return redacted;
}

function deriveToolStatus(phase, payload, errorMessage) {
  if (phase === "pre-tool") {
    return "started";
  }

  if (errorMessage) {
    return "failed";
  }

  const rawStatus = pickFirstString(payload, ["status", "tool_status", "toolStatus"]);
  if (rawStatus) {
    const normalized = rawStatus.toLowerCase();
    if (["failed", "failure", "error", "errored"].includes(normalized)) return "failed";
    if (["ok", "success", "succeeded", "complete", "completed"].includes(normalized)) return "succeeded";
    if (["started", "running"].includes(normalized)) return "started";
  }

  if (phase === "post-tool") {
    return "succeeded";
  }

  return "unknown";
}

function pickToolName(payload) {
  const directName = pickFirstString(payload, [
    "tool_name",
    "toolName",
    "name",
    "tool",
  ]);
  if (directName) return directName;

  if (isRecord(payload.tool) && typeof payload.tool.name === "string") {
    return payload.tool.name;
  }

  return undefined;
}

function pickDurationMs(payload) {
  const value =
    payload.duration_ms ??
    payload.durationMs ??
    payload.elapsed_ms ??
    payload.elapsedMs;

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
  }

  return undefined;
}

function pickErrorMessage(payload) {
  const value =
    payload.error ??
    payload.error_message ??
    payload.errorMessage ??
    payload.stderr;

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (isRecord(value)) {
    return value.message ? String(value.message) : safeStringify(value);
  }

  if (payload.is_error === true || payload.isError === true) {
    return "Tool reported an error";
  }

  return undefined;
}

function buildMetadata(payload, parseError) {
  return dropUndefined({
    hookEventName: pickFirstString(payload, ["hook_event_name", "hookEventName"]),
    matcher: pickFirstString(payload, ["matcher"]),
    parseError,
    rawPayloadKeys: Object.keys(payload).slice(0, 24),
  });
}

function pickFirstString(payload, keys) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function dropUndefined(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
