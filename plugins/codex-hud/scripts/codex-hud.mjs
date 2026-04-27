#!/usr/bin/env node

import { runCodexHud } from "../src/wrapper/launcher.mjs";

try {
  const exitCode = await runCodexHud(process.argv.slice(2));
  process.exit(exitCode);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`codex-hud: ${message}\n`);
  process.exit(1);
}
