import fs from "node:fs";
import path from "node:path";
import { resolveEventsDir, sanitizeFilePart } from "./paths.mjs";

export function appendEvent(event, options = {}) {
  const eventsDir = resolveEventsDir(options);
  fs.mkdirSync(eventsDir, { recursive: true });

  const eventFile = path.join(eventsDir, `${sanitizeFilePart(event.sessionId)}.jsonl`);
  fs.appendFileSync(eventFile, `${JSON.stringify(event)}\n`, "utf8");
  return eventFile;
}

export function readEvents(options = {}) {
  const eventsDir = resolveEventsDir(options);
  const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : 1000;

  if (!fs.existsSync(eventsDir)) {
    return [];
  }

  const sessionId = options.sessionId ? sanitizeFilePart(options.sessionId) : undefined;
  const files = fs
    .readdirSync(eventsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .filter((entry) => !sessionId || entry.name === `${sessionId}.jsonl`)
    .map((entry) => path.join(eventsDir, entry.name));

  const events = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // Ignore corrupted lines so one bad write does not break the HUD.
      }
    }
  }

  events.sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)));
  return limit === 0 ? events : events.slice(-limit);
}

export function listEventFiles(options = {}) {
  const eventsDir = resolveEventsDir(options);
  if (!fs.existsSync(eventsDir)) return [];

  return fs
    .readdirSync(eventsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => path.join(eventsDir, entry.name));
}
