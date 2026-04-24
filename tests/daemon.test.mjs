import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHudServer } from "../plugins/codex-hud/src/daemon/server.mjs";
import { appendEvent, createHudEvent } from "../plugins/codex-hud/src/core/index.mjs";

test("daemon serves health and status endpoints", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-daemon-"));
  const env = { CODEX_HUD_HOME: tempDir, CODEX_SESSION_ID: "daemon-session" };
  const event = createHudEvent({
    phase: "session-start",
    payload: {},
    cwd: tempDir,
    env,
    now: new Date("2026-04-24T01:00:00.000Z"),
  });
  appendEvent(event, { cwd: tempDir, env });

  const server = createHudServer({ cwd: tempDir, env });
  await listen(server);

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const health = await getJson(`${baseUrl}/health`);
    const status = await getJson(`${baseUrl}/status`);

    assert.equal(health.ok, true);
    assert.equal(health.eventCount, 1);
    assert.equal(status.sessionCount, 1);
    assert.equal(status.activeSessionId, "daemon-session");
  } finally {
    await close(server);
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}
