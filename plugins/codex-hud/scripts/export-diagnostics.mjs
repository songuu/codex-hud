#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readEvents,
  reduceEvents,
  resolveDiagnosticsDir,
  resolveHudHome,
} from "../src/core/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const diagnosticsDir = resolveDiagnosticsDir({ cwd: process.cwd(), env: process.env });
const events = readEvents({ cwd: process.cwd(), env: process.env, limit: 500 });
const status = reduceEvents(events);

fs.mkdirSync(diagnosticsDir, { recursive: true });

const diagnostics = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  cwd: process.cwd(),
  hudHome: resolveHudHome({ cwd: process.cwd(), env: process.env }),
  plugin: readJsonIfExists(path.join(pluginRoot, ".codex-plugin", "plugin.json")),
  hooks: readJsonIfExists(path.join(pluginRoot, "hooks.json")),
  status,
  recentEvents: events.slice(-100),
};

const outputPath = path.join(
  diagnosticsDir,
  `codex-hud-diagnostics-${Date.now()}.json`,
);

fs.writeFileSync(outputPath, JSON.stringify(diagnostics, null, 2), "utf8");
process.stdout.write(`${outputPath}\n`);

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
