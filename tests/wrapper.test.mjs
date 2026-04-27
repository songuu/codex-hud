import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendEvent, createHudEvent } from "../plugins/codex-hud/src/core/index.mjs";
import { resolveRuntimeAdapter, selectRendererAdapter } from "../plugins/codex-hud/src/wrapper/adapters.mjs";
import { parseWrapperArgs, renderWrapperHelp } from "../plugins/codex-hud/src/wrapper/args.mjs";
import {
  buildChildEnv,
  buildStdioSpawnOptions,
  resolveCodexLaunch,
  resolveWindowsExecutable,
} from "../plugins/codex-hud/src/wrapper/launcher.mjs";
import {
  removePowerShellShim,
  renderPowerShellShim,
  resolvePowerShellProfilePath,
  resolvePowerShellProfilePaths,
  upsertPowerShellShim,
} from "../plugins/codex-hud/src/wrapper/powershell-shim.mjs";
import {
  createHudFrame,
  createHudSupervisor,
  renderBottomOverlay,
  renderInlineFrame,
} from "../plugins/codex-hud/src/wrapper/hud-supervisor.mjs";

test("parseWrapperArgs separates HUD flags from Codex args", () => {
  const parsed = parseWrapperArgs(
    [
      "--hud-adapter",
      "pty",
      "--hud-lines=3",
      "--hud-interval-ms",
      "250",
      "--hud-no-color",
      "--",
      "--model",
      "gpt-5.5",
      "hello",
    ],
    { env: {} },
  );

  assert.equal(parsed.wrapper.adapter, "pty");
  assert.equal(parsed.wrapper.hudLines, 3);
  assert.equal(parsed.wrapper.intervalMs, 250);
  assert.equal(parsed.wrapper.color, false);
  assert.equal(parsed.codex.bin, "codex");
  assert.deepEqual(parsed.codex.args, ["--model", "gpt-5.5", "hello"]);
});

test("selectRendererAdapter prefers host, then pty, then stdio fallback", () => {
  assert.equal(
    selectRendererAdapter({
      env: { CODEX_HUD_HOST_RENDERER_API: "1" },
      ptyAvailable: true,
      requested: "auto",
    }).name,
    "host",
  );
  assert.equal(selectRendererAdapter({ env: {}, ptyAvailable: true, requested: "auto" }).name, "pty");
  assert.equal(selectRendererAdapter({ env: {}, ptyAvailable: false, requested: "auto" }).name, "stdio");

  const explicitPty = selectRendererAdapter({ env: {}, ptyAvailable: false, requested: "pty" });
  assert.equal(explicitPty.name, "pty");
  assert.equal(explicitPty.available, false);
});

test("resolveRuntimeAdapter falls back to stdio when parent streams are not TTYs", async () => {
  const adapter = await resolveRuntimeAdapter({
    env: {},
    requested: "auto",
    ttyAvailable: false,
  });

  assert.equal(adapter.name, "stdio");
  assert.equal(adapter.available, true);
  assert.equal(adapter.nodePty, undefined);
  assert.match(adapter.reason, /using stdio fallback/);
});

test("createHudFrame renders current event state for wrapper supervisor", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-wrapper-"));
  const env = { CODEX_HUD_HOME: tempDir, CODEX_SESSION_ID: "wrapper-session" };
  const event = createHudEvent({
    phase: "pre-tool",
    payload: { tool_name: "shell_command", tool_call_id: "call-1" },
    cwd: tempDir,
    env,
    now: new Date("2026-04-24T01:00:00.000Z"),
  });
  appendEvent(event, { cwd: tempDir, env });

  const frame = createHudFrame({
    color: false,
    cwd: tempDir,
    env,
    maxToolRows: 1,
    width: 100,
  });

  assert.match(frame, /^\[Codex\]/);
  assert.match(frame, /0%/);
  assert.match(frame, /● 1 running \| 0\/1 tools complete/);
  assert.match(frame, /shell_command/);
});

test("renderBottomOverlay reserves terminal bottom lines", () => {
  const overlay = renderBottomOverlay("one\ntwo", { columns: 20, hudLines: 3, rows: 10 });

  assert.match(overlay, /^\x1b\[s/);
  assert.match(overlay, /\x1b\[8;1H\x1b\[2Kone/);
  assert.match(overlay, /\x1b\[9;1H\x1b\[2Ktwo/);
  assert.match(overlay, /\x1b\[10;1H\x1b\[2K/);
  assert.match(overlay, /\x1b\[u$/);
});

test("createHudSupervisor writes overlay frames without starting Codex", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-supervisor-"));
  const chunks = [];
  const output = {
    columns: 80,
    isTTY: true,
    rows: 24,
    write: (chunk) => chunks.push(chunk),
  };

  const supervisor = createHudSupervisor({
    color: false,
    cwd: tempDir,
    env: { CODEX_HUD_HOME: tempDir },
    output,
  });
  const frame = supervisor.renderNow();
  supervisor.stop();

  assert.equal(chunks.length, 1);
  assert.equal(frame, chunks[0]);
  assert.match(frame, /\x1b\[21;1H/);
  assert.match(frame, /Waiting for Codex hook events/);
});

test("buildChildEnv disables duplicate hook inline rendering under wrapper", () => {
  const env = buildChildEnv({ CODEX_HUD_RENDER: "inline", PATH: "x" });

  assert.equal(env.CODEX_HUD_WRAPPER, "1");
  assert.equal(env.CODEX_HUD_RENDER, "off");
  assert.equal(env.PATH, "x");
});

test("buildChildEnv uses user-local HUD home for global wrapper state", () => {
  const env = buildChildEnv({
    LOCALAPPDATA: "C:\\Users\\songyu\\AppData\\Local",
    PATH: "x",
  });

  assert.equal(env.CODEX_HUD_HOME, path.join("C:\\Users\\songyu\\AppData\\Local", "codex-hud"));
});

test("buildChildEnv preserves explicit HUD home overrides", () => {
  const env = buildChildEnv({
    CODEX_HUD_HOME: "C:\\custom\\hud",
    LOCALAPPDATA: "C:\\Users\\songyu\\AppData\\Local",
  });

  assert.equal(env.CODEX_HUD_HOME, "C:\\custom\\hud");
});

test("buildStdioSpawnOptions avoids shell-based argument forwarding", () => {
  const options = buildStdioSpawnOptions({ cwd: "/tmp/project", env: { PATH: "x" } });

  assert.equal(options.shell, false);
  assert.equal(options.stdio, "inherit");
  assert.equal(options.cwd, "/tmp/project");
});

test("resolveCodexLaunch preserves PowerShell and cmd Codex wrappers on Windows", () => {
  const powershellPath = path.join(os.tmpdir(), "pwsh.exe");
  const ps1Launch = resolveCodexLaunch(
    { codex: { args: ["--version"], bin: "C:\\Users\\songyu\\AppData\\Roaming\\npm\\codex.ps1" } },
    { env: { CODEX_HUD_POWERSHELL_BIN: powershellPath }, platform: "win32" },
  );
  const cmdLaunch = resolveCodexLaunch(
    { codex: { args: ["--help"], bin: "C:\\Users\\songyu\\AppData\\Roaming\\npm\\codex.cmd" } },
    { env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" }, platform: "win32" },
  );

  assert.equal(ps1Launch.bin, powershellPath);
  assert.deepEqual(ps1Launch.args, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "C:\\Users\\songyu\\AppData\\Roaming\\npm\\codex.ps1",
    "--version",
  ]);
  assert.equal(cmdLaunch.bin, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(cmdLaunch.args, [
    "/d",
    "/s",
    "/c",
    "C:\\Users\\songyu\\AppData\\Roaming\\npm\\codex.cmd",
    "--help",
  ]);
});

test("resolveWindowsExecutable expands PATH commands for node-pty on Windows", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-path-"));
  const executable = path.join(tempDir, "pwsh.exe");
  fs.writeFileSync(executable, "");

  assert.equal(
    resolveWindowsExecutable("pwsh", {
      PATH: tempDir,
      PATHEXT: ".exe;.cmd",
    }),
    executable,
  );
  assert.equal(resolveWindowsExecutable(executable, { PATH: "" }), executable);
});

test("resolveCodexLaunch expands default pwsh for Windows ps1 wrappers", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-pwsh-"));
  const powershellPath = path.join(tempDir, "pwsh.exe");
  fs.writeFileSync(powershellPath, "");

  const launch = resolveCodexLaunch(
    { codex: { args: [], bin: "C:\\Users\\songyu\\AppData\\Roaming\\npm\\codex.ps1" } },
    {
      env: {
        PATH: tempDir,
        PATHEXT: ".exe;.cmd",
      },
      platform: "win32",
    },
  );

  assert.equal(launch.bin, powershellPath);
});

test("wrapper help documents PTY and host adapter paths", () => {
  const help = renderWrapperHelp();

  assert.match(help, /--hud-adapter <auto\|host\|pty\|stdio>/);
  assert.match(help, /--hud-no-status/);
});

test("renderInlineFrame provides non-TTY fallback output", () => {
  assert.equal(renderInlineFrame("status"), "\nstatus\n");
});

test("renderPowerShellShim leaves codex raw and exposes codex-hub wrapper commands", () => {
  const shim = renderPowerShellShim({
    repoRoot: "C:\\project\\my\\hud",
    scriptRelativePath: "plugins\\codex-hud\\scripts\\codex-hud.mjs",
  });

  assert.doesNotMatch(shim, /function global:codex \{/);
  assert.match(shim, /function global:codex-hub \{/);
  assert.match(shim, /function global:codex-hud \{/);
  assert.match(shim, /codex-hud\\scripts\\codex-hud\.mjs/);
  assert.match(shim, /CODEX_HUD_CODEX_BIN/);
  assert.match(shim, /CODEX_HUD_POWERSHELL_BIN/);
  assert.match(shim, /ResolveCodexHudPowerShellBin/);
  assert.match(shim, /function global:codex-raw \{/);
  assert.match(shim, /function global:codex-hub-doctor \{/);
  assert.match(shim, /function global:codex-hud-doctor \{/);
  assert.match(shim, /Get-Command codex -CommandType ExternalScript,Application/);
});

test("PowerShell shim upsert is idempotent and uninstall removes managed block", () => {
  const firstShim = renderPowerShellShim({ repoRoot: "C:\\project\\old" });
  const nextShim = renderPowerShellShim({ repoRoot: "C:\\project\\new" });
  const initial = "Write-Host 'hello'\n";

  const installed = upsertPowerShellShim(initial, firstShim);
  const replaced = upsertPowerShellShim(installed, nextShim);
  const uninstalled = removePowerShellShim(replaced);

  assert.equal((replaced.match(/>>> codex-hud wrapper >>>/g) || []).length, 1);
  assert.match(replaced, /C:\\project\\new/);
  assert.doesNotMatch(replaced, /C:\\project\\old/);
  assert.equal(uninstalled, initial);
});

test("resolvePowerShellProfilePath supports explicit and env overrides", () => {
  assert.equal(
    resolvePowerShellProfilePath({ profilePath: "C:\\tmp\\profile.ps1" }),
    path.resolve("C:\\tmp\\profile.ps1"),
  );
  assert.equal(
    resolvePowerShellProfilePath({
      env: {
        CODEX_HUD_POWERSHELL_PROFILE: "C:\\custom\\profile.ps1",
        USERPROFILE: "C:\\Users\\songyu",
      },
    }),
    path.resolve("C:\\custom\\profile.ps1"),
  );
  assert.equal(
    resolvePowerShellProfilePath({ env: { USERPROFILE: "C:\\Users\\songyu" } }),
    path.join("C:\\Users\\songyu", "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
  );
});

test("resolvePowerShellProfilePaths supports global PowerShell installation targets", () => {
  const targets = resolvePowerShellProfilePaths({
    env: { USERPROFILE: "C:\\Users\\songyu" },
    scope: "global",
  });

  assert.deepEqual(targets, [
    path.join("C:\\Users\\songyu", "Documents", "PowerShell", "profile.ps1"),
    path.join("C:\\Users\\songyu", "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
    path.join("C:\\Users\\songyu", "Documents", "WindowsPowerShell", "profile.ps1"),
    path.join("C:\\Users\\songyu", "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
  ]);
});
