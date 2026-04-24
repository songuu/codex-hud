#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(pluginRoot, "../..");

const requiredFiles = [
  "package.json",
  "plugins/codex-hud/.codex-plugin/plugin.json",
  "plugins/codex-hud/hooks.json",
  "plugins/codex-hud/skills/hud/SKILL.md",
  "plugins/codex-hud/scripts/hook-runner.mjs",
  "plugins/codex-hud/scripts/hud-daemon.mjs",
  "plugins/codex-hud/scripts/hud-terminal.mjs",
  "plugins/codex-hud/scripts/export-diagnostics.mjs",
  "plugins/codex-hud/src/core/index.mjs",
  "plugins/codex-hud/src/daemon/server.mjs",
  "plugins/codex-hud/src/terminal/claude-style.mjs",
  "plugins/codex-hud/src/ui/index.html",
  ".agents/plugins/marketplace.json",
];

const errors = [];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing required file: ${relativePath}`);
  }
}

const pluginJson = readJson("plugins/codex-hud/.codex-plugin/plugin.json");
const hooksJson = readJson("plugins/codex-hud/hooks.json");
const marketplaceJson = readJson(".agents/plugins/marketplace.json");

if (pluginJson) {
  requireString(pluginJson.name, "plugin.name");
  requireString(pluginJson.version, "plugin.version");
  requireString(pluginJson.description, "plugin.description");
  requireString(pluginJson.skills, "plugin.skills");
  requireString(pluginJson.hooks, "plugin.hooks");
  requireString(pluginJson.interface?.displayName, "plugin.interface.displayName");
  rejectTodo(pluginJson, "plugin.json");
}

if (hooksJson) {
  rejectTodo(hooksJson, "hooks.json");
  const hookConfig = hooksJson.hooks || {};
  for (const hookName of ["SessionStart", "PreToolUse", "PostToolUse", "Stop"]) {
    if (!Array.isArray(hookConfig[hookName])) {
      errors.push(`Missing hook array: ${hookName}`);
    }
  }
  const hookCommands = JSON.stringify(hookConfig);
  if (!hookCommands.includes("scripts/hook-runner.mjs")) {
    errors.push("hooks.json does not call scripts/hook-runner.mjs");
  }
}

if (marketplaceJson) {
  rejectTodo(marketplaceJson, "marketplace.json");
  const entry = marketplaceJson.plugins?.find((plugin) => plugin.name === "codex-hud");
  if (!entry) {
    errors.push("marketplace.json does not include codex-hud");
  } else {
    requireString(entry.source?.path, "marketplace.plugins[].source.path");
    requireString(entry.policy?.installation, "marketplace.plugins[].policy.installation");
    requireString(entry.policy?.authentication, "marketplace.plugins[].policy.authentication");
    requireString(entry.category, "marketplace.plugins[].category");
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    process.stderr.write(`- ${error}\n`);
  }
  process.exit(1);
}

process.stdout.write("codex-hud validation passed\n");

function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    errors.push(`Invalid JSON in ${relativePath}: ${error.message}`);
    return undefined;
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`Missing string: ${label}`);
  }
}

function rejectTodo(value, label) {
  if (JSON.stringify(value).includes("[TODO:")) {
    errors.push(`${label} still contains TODO placeholders`);
  }
}
