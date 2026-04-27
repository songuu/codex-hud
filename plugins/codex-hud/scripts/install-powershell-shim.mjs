#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  removePowerShellShim,
  renderPowerShellShim,
  resolvePowerShellProfilePaths,
  upsertPowerShellShim,
} from "../src/wrapper/powershell-shim.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

try {
  const parsed = parseInstallerArgs(process.argv.slice(2));
  const profilePaths = resolvePowerShellProfilePaths({
    env: process.env,
    profilePath: parsed.profilePath,
    scope: parsed.scope,
  });
  const shim = renderPowerShellShim({ repoRoot });
  const changes = profilePaths.map((profilePath) => {
    const currentContents = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, "utf8") : "";
    const nextContents = parsed.uninstall
      ? removePowerShellShim(currentContents)
      : upsertPowerShellShim(currentContents, shim);

    return { nextContents, profilePath };
  });

  if (parsed.dryRun) {
    for (const change of changes) {
      process.stdout.write(`# ${change.profilePath}\n${change.nextContents}\n`);
    }
    process.exit(0);
  }

  for (const change of changes) {
    fs.mkdirSync(path.dirname(change.profilePath), { recursive: true });
    fs.writeFileSync(change.profilePath, change.nextContents, "utf8");
  }

  if (parsed.uninstall) {
    process.stdout.write(`Codex HUD PowerShell shim removed from ${profilePaths.length} profile(s):\n`);
  } else {
    process.stdout.write(`Codex HUD PowerShell shim installed in ${profilePaths.length} profile(s):\n`);
  }
  for (const profilePath of profilePaths) {
    process.stdout.write(`- ${profilePath}\n`);
  }
  if (!parsed.uninstall) {
    process.stdout.write("Open a new PowerShell terminal, then run: codex-hub\n");
    process.stdout.write("Plain codex remains the upstream Codex CLI.\n");
    process.stdout.write("Run codex-hub-doctor to verify global command resolution.\n");
  }
} catch (error) {
  process.stderr.write(`codex-hud: failed to install PowerShell shim: ${error.message}\n`);
  process.exit(1);
}

function parseInstallerArgs(argv) {
  const parsed = {
    dryRun: false,
    profilePath: undefined,
    scope: "current-host",
    uninstall: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--global") {
      parsed.scope = "global";
    } else if (arg === "--scope") {
      parsed.scope = readValue(argv, index, "--scope");
      index += 1;
    } else if (arg.startsWith("--scope=")) {
      parsed.scope = normalizeValue(arg.slice("--scope=".length), "--scope");
    } else if (arg === "--uninstall") {
      parsed.uninstall = true;
    } else if (arg === "--profile") {
      parsed.profilePath = readValue(argv, index, "--profile");
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      parsed.profilePath = normalizeValue(arg.slice("--profile=".length), "--profile");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function readValue(argv, index, label) {
  return normalizeValue(argv[index + 1], label);
}

function normalizeValue(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} requires a value`);
  }

  return value.trim();
}
