const connection = document.querySelector("#connection");
const sessionCount = document.querySelector("#session-count");
const toolCount = document.querySelector("#tool-count");
const failureCount = document.querySelector("#failure-count");
const slowCount = document.querySelector("#slow-count");
const sessionStatus = document.querySelector("#session-status");
const sessionId = document.querySelector("#session-id");
const workspace = document.querySelector("#workspace");
const lastActivity = document.querySelector("#last-activity");
const timeline = document.querySelector("#timeline");
const refreshButton = document.querySelector("#refresh");

refreshButton.addEventListener("click", () => {
  loadStatus().catch(() => setConnection(false));
});

loadStatus().catch(() => setConnection(false));
connectStream();

async function loadStatus() {
  const response = await fetch("/status");
  if (!response.ok) throw new Error(`Status request failed: ${response.status}`);
  renderStatus(await response.json());
  setConnection(true);
}

function connectStream() {
  if (!("EventSource" in window)) return;

  const stream = new EventSource("/stream");
  stream.addEventListener("open", () => setConnection(true));
  stream.addEventListener("status", (event) => {
    renderStatus(JSON.parse(event.data));
    setConnection(true);
  });
  stream.addEventListener("error", () => {
    setConnection(false);
  });
}

function renderStatus(status) {
  const activeSession =
    status.sessions.find((session) => session.sessionId === status.activeSessionId) ||
    status.sessions[0];

  sessionCount.textContent = String(status.sessionCount || 0);
  toolCount.textContent = String(status.totals?.toolCalls || 0);
  failureCount.textContent = String(status.totals?.failedTools || 0);
  slowCount.textContent = String(status.totals?.slowTools || 0);

  if (!activeSession) {
    sessionStatus.textContent = "unknown";
    sessionStatus.className = "pill";
    sessionId.textContent = "No session yet";
    workspace.textContent = "Waiting for events";
    lastActivity.textContent = "-";
    renderTimeline([]);
    return;
  }

  sessionStatus.textContent = activeSession.status;
  sessionStatus.className = `pill ${activeSession.status}`;
  sessionId.textContent = activeSession.sessionId;
  workspace.textContent = activeSession.cwd || "-";
  lastActivity.textContent = formatTime(activeSession.lastActivityAt);
  renderTimeline(activeSession.toolCalls || []);
}

function renderTimeline(toolCalls) {
  const latestCalls = [...toolCalls].reverse().slice(0, 80);

  if (latestCalls.length === 0) {
    timeline.className = "timeline empty";
    timeline.textContent = "Waiting for Codex hook events";
    return;
  }

  timeline.className = "timeline";
  timeline.replaceChildren(
    ...latestCalls.map((toolCall) => {
      const element = document.createElement("article");
      element.className = `tool-call ${toolCall.status}`;
      element.innerHTML = `
        <div class="tool-head">
          <div class="tool-name"></div>
          <div class="tool-meta"></div>
        </div>
        <div class="summary"></div>
      `;

      element.querySelector(".tool-name").textContent = toolCall.toolName || "unknown";
      element.querySelector(".tool-meta").textContent = [
        toolCall.status,
        formatDuration(toolCall.durationMs),
        formatTime(toolCall.startedAt),
      ]
        .filter(Boolean)
        .join(" | ");
      element.querySelector(".summary").textContent =
        toolCall.errorMessage ||
        toolCall.outputSummary ||
        toolCall.inputSummary ||
        "No summary captured";
      return element;
    }),
  );
}

function setConnection(isOnline) {
  connection.textContent = isOnline ? "Online" : "Offline";
  connection.className = `connection ${isOnline ? "online" : "offline"}`;
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(value) {
  if (value === undefined || value === null) return "";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}
