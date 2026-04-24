import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reduceEvents, readEvents, resolveEventsDir, resolveHudHome } from "../core/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.resolve(__dirname, "../ui");

export function createHudServer(options = {}) {
  const hudHome = resolveHudHome(options);
  const startedAt = new Date();

  return http.createServer((request, response) => {
    routeRequest(request, response, { ...options, hudHome, startedAt }).catch((error) => {
      writeJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

export function loadHudStatus(options = {}) {
  const events = readEvents({ ...options, limit: options.limit ?? 2000 });
  return reduceEvents(events);
}

async function routeRequest(request, response, context) {
  const url = new URL(request.url || "/", "http://127.0.0.1");

  if (request.method !== "GET") {
    writeJson(response, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  if (url.pathname === "/health") {
    const events = readEvents({ ...context, limit: 0 });
    writeJson(response, 200, {
      ok: true,
      hudHome: context.hudHome,
      eventCount: events.length,
      uptimeSeconds: Math.round((Date.now() - context.startedAt.getTime()) / 1000),
    });
    return;
  }

  if (url.pathname === "/status") {
    writeJson(response, 200, loadHudStatus(context));
    return;
  }

  if (url.pathname === "/events") {
    const limit = Number(url.searchParams.get("limit") || 200);
    writeJson(response, 200, {
      events: readEvents({ ...context, limit }),
    });
    return;
  }

  if (url.pathname === "/stream") {
    streamStatus(response, context);
    return;
  }

  const staticFile = resolveStaticFile(url.pathname);
  if (staticFile) {
    serveStatic(response, staticFile);
    return;
  }

  writeJson(response, 404, { ok: false, error: "Not found" });
}

function streamStatus(response, context) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const sendStatus = () => {
    response.write(`event: status\n`);
    response.write(`data: ${JSON.stringify(loadHudStatus(context))}\n\n`);
  };

  const eventsDir = resolveEventsDir(context);
  fs.mkdirSync(eventsDir, { recursive: true });
  sendStatus();

  let debounceTimer;
  const watcher = fs.watch(eventsDir, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendStatus, 150);
  });

  const heartbeat = setInterval(() => {
    response.write(`event: heartbeat\n`);
    response.write(`data: ${JSON.stringify({ ok: true, timestamp: new Date().toISOString() })}\n\n`);
  }, 15_000);

  response.on("close", () => {
    clearTimeout(debounceTimer);
    clearInterval(heartbeat);
    watcher.close();
  });
}

function resolveStaticFile(requestPath) {
  if (requestPath === "/") return path.join(UI_DIR, "index.html");
  if (requestPath === "/app.js") return path.join(UI_DIR, "app.js");
  if (requestPath === "/styles.css") return path.join(UI_DIR, "styles.css");
  return undefined;
}

function serveStatic(response, filePath) {
  if (!fs.existsSync(filePath)) {
    writeJson(response, 404, { ok: false, error: "Static file not found" });
    return;
  }

  const ext = path.extname(filePath);
  const contentType = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html";
  response.writeHead(200, { "Content-Type": `${contentType}; charset=utf-8` });
  response.end(fs.readFileSync(filePath));
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body, null, 2));
}
