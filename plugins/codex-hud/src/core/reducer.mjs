const SLOW_TOOL_THRESHOLD_MS = 10_000;

export function reduceEvents(events, options = {}) {
  const sortedEvents = [...events].sort((left, right) =>
    String(left.timestamp).localeCompare(String(right.timestamp)),
  );
  const sessionsById = new Map();

  for (const event of sortedEvents) {
    if (!event || typeof event !== "object") continue;

    const session = ensureSession(sessionsById, event);
    session.eventCount += 1;
    session.lastActivityAt = event.timestamp || session.lastActivityAt;
    session.cwd = event.cwd || session.cwd;

    applyLifecycleEvent(session, event);
    applyToolEvent(session, event);
  }

  const sessions = [...sessionsById.values()].sort((left, right) =>
    String(right.lastActivityAt).localeCompare(String(left.lastActivityAt)),
  );
  const activeSession = sessions.find((session) => session.status !== "ended") || sessions[0];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    slowToolThresholdMs: options.slowToolThresholdMs ?? SLOW_TOOL_THRESHOLD_MS,
    activeSessionId: activeSession?.sessionId,
    sessionCount: sessions.length,
    eventCount: sortedEvents.length,
    totals: summarizeTotals(sessions),
    sessions,
  };
}

function ensureSession(sessionsById, event) {
  const sessionId = event.sessionId || "unknown";

  if (!sessionsById.has(sessionId)) {
    sessionsById.set(sessionId, {
      sessionId,
      cwd: event.cwd || "",
      status: "running",
      startedAt: event.timestamp || new Date().toISOString(),
      endedAt: undefined,
      lastActivityAt: event.timestamp || new Date().toISOString(),
      eventCount: 0,
      toolCalls: [],
      totals: {
        toolCalls: 0,
        failedTools: 0,
        runningTools: 0,
        slowTools: 0,
      },
    });
  }

  return sessionsById.get(sessionId);
}

function applyLifecycleEvent(session, event) {
  switch (event.phase) {
    case "session-start":
      session.status = "running";
      session.startedAt = event.timestamp || session.startedAt;
      break;
    case "stop":
      if (session.status !== "ended") {
        session.status = "stopping";
      }
      break;
    case "session-end":
      session.status = "ended";
      session.endedAt = event.timestamp || session.endedAt;
      break;
    default:
      break;
  }
}

function applyToolEvent(session, event) {
  if (event.phase === "pre-tool") {
    session.toolCalls.push({
      id: event.toolCallId || event.eventId,
      eventId: event.eventId,
      toolName: event.toolName || "unknown",
      status: "running",
      startedAt: event.timestamp,
      endedAt: undefined,
      durationMs: undefined,
      inputSummary: event.inputSummary,
      outputSummary: undefined,
      errorMessage: undefined,
    });
    updateSessionToolTotals(session);
    return;
  }

  if (event.phase !== "post-tool") {
    return;
  }

  const toolCall = findMatchingToolCall(session, event);
  if (toolCall) {
    toolCall.status = event.toolStatus === "failed" ? "failed" : "succeeded";
    toolCall.endedAt = event.timestamp;
    toolCall.durationMs = event.durationMs ?? elapsedMs(toolCall.startedAt, event.timestamp);
    toolCall.outputSummary = event.outputSummary;
    toolCall.errorMessage = event.errorMessage;
  } else {
    session.toolCalls.push({
      id: event.toolCallId || event.eventId,
      eventId: event.eventId,
      toolName: event.toolName || "unknown",
      status: event.toolStatus === "failed" ? "failed" : "succeeded",
      startedAt: event.timestamp,
      endedAt: event.timestamp,
      durationMs: event.durationMs,
      inputSummary: event.inputSummary,
      outputSummary: event.outputSummary,
      errorMessage: event.errorMessage,
    });
  }

  updateSessionToolTotals(session);
}

function findMatchingToolCall(session, event) {
  if (event.toolCallId) {
    const byId = [...session.toolCalls]
      .reverse()
      .find((call) => call.id === event.toolCallId && call.status === "running");
    if (byId) return byId;
  }

  return [...session.toolCalls]
    .reverse()
    .find((call) => call.status === "running" && call.toolName === (event.toolName || "unknown"));
}

function updateSessionToolTotals(session) {
  session.totals.toolCalls = session.toolCalls.length;
  session.totals.failedTools = session.toolCalls.filter((call) => call.status === "failed").length;
  session.totals.runningTools = session.toolCalls.filter((call) => call.status === "running").length;
  session.totals.slowTools = session.toolCalls.filter(
    (call) => Number(call.durationMs || 0) >= SLOW_TOOL_THRESHOLD_MS,
  ).length;
}

function summarizeTotals(sessions) {
  return sessions.reduce(
    (totals, session) => {
      totals.toolCalls += session.totals.toolCalls;
      totals.failedTools += session.totals.failedTools;
      totals.runningTools += session.totals.runningTools;
      totals.slowTools += session.totals.slowTools;
      return totals;
    },
    {
      toolCalls: 0,
      failedTools: 0,
      runningTools: 0,
      slowTools: 0,
    },
  );
}

function elapsedMs(startedAt, endedAt) {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }
  return Math.max(0, end - start);
}
