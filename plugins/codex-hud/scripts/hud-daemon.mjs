#!/usr/bin/env node

import { createHudServer } from "../src/daemon/server.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const nextValue = inlineValue ?? process.argv[index + 1];
    args.set(key, nextValue);
    if (inlineValue === undefined && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
      index += 1;
    }
  }
}

const host = args.get("host") || process.env.CODEX_HUD_HOST || "127.0.0.1";
const port = Number(args.get("port") || process.env.CODEX_HUD_PORT || 17384);
const server = createHudServer({ cwd: process.cwd(), env: process.env });

server.listen(port, host, () => {
  const address = `http://${host}:${port}`;
  process.stdout.write(`Codex HUD listening on ${address}\n`);
});

server.on("error", (error) => {
  process.stderr.write(`Codex HUD failed to start: ${error.message}\n`);
  process.exitCode = 1;
});
