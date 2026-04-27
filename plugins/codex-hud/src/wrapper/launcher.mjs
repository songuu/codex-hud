import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describeAdapter, resolveRuntimeAdapter } from "./adapters.mjs";
import { parseWrapperArgs, renderWrapperHelp } from "./args.mjs";
import { createHudSupervisor } from "./hud-supervisor.mjs";

export async function runCodexHud(argv = [], options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env ?? process.env;
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const parsed = parseWrapperArgs(argv, { env });

  if (parsed.wrapper.help) {
    stdout.write(renderWrapperHelp());
    return 0;
  }

  const adapter = await resolveRuntimeAdapter({
    requested: parsed.wrapper.adapter,
    env,
    ttyAvailable: Boolean(stdin.isTTY && stdout.isTTY),
  });

  if (!adapter.available) {
    stderr.write(`codex-hud: ${describeAdapter(adapter)}\n`);
    return 2;
  }

  const childEnv = buildChildEnv(env);
  const supervisor = parsed.wrapper.status
    ? createHudSupervisor({
        color: parsed.wrapper.color ?? Boolean(stdout.isTTY),
        cwd,
        env: childEnv,
        hudLines: parsed.wrapper.hudLines,
        intervalMs: parsed.wrapper.intervalMs,
        output: stdout,
        overlay: true,
      })
    : undefined;

  if (supervisor) {
    supervisor.start();
  }

  try {
    if (adapter.name === "host") {
      stderr.write("codex-hud: host renderer adapter selected; launching Codex with host HUD environment.\n");
      return await runStdioCodex({ cwd, env: childEnv, parsed, stderr });
    }

    if (adapter.name === "pty") {
      return await runPtyCodex({
        adapter,
        cwd,
        env: childEnv,
        hudLines: parsed.wrapper.hudLines,
        parsed,
        stdin,
        stdout,
      });
    }

    if (parsed.wrapper.status && stderr.isTTY) {
      stderr.write(`codex-hud: using ${describeAdapter(adapter)}\n`);
    }
    return await runStdioCodex({ cwd, env: childEnv, parsed, stderr });
  } finally {
    if (supervisor) {
      supervisor.stop();
    }
  }
}

export function buildChildEnv(env = process.env) {
  const childEnv = {
    ...env,
    CODEX_HUD_WRAPPER: "1",
    CODEX_HUD_RENDER: env.CODEX_HUD_RENDER === "inline" ? "off" : env.CODEX_HUD_RENDER || "off",
  };

  if (!childEnv.CODEX_HUD_HOME && !childEnv.HUD_HOME) {
    childEnv.CODEX_HUD_HOME = resolveGlobalHudHome(env);
  }

  return childEnv;
}

export function buildStdioSpawnOptions(options) {
  return {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    stdio: "inherit",
  };
}

function runStdioCodex(options) {
  return new Promise((resolve) => {
    const launch = resolveCodexLaunch(options.parsed, { env: options.env });
    const child = spawn(launch.bin, launch.args, buildStdioSpawnOptions({
      cwd: options.cwd,
      env: options.env,
    }));

    child.on("error", (error) => {
      options.stderr.write(`codex-hud: failed to start ${launch.displayName}: ${error.message}\n`);
      resolve(127);
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(128);
      } else {
        resolve(Number.isInteger(code) ? code : 0);
      }
    });
  });
}

function runPtyCodex(options) {
  return new Promise((resolve) => {
    const ptyModule = options.adapter.nodePty;
    const launch = resolveCodexLaunch(options.parsed, { env: options.env });
    const columns = options.stdout.columns || 88;
    const rows = Math.max(8, (options.stdout.rows || 24) - options.hudLines);
    const ptyProcess = ptyModule.spawn(launch.bin, launch.args, {
      cols: columns,
      cwd: options.cwd,
      env: options.env,
      name: "xterm-256color",
      rows,
    });
    let rawModeEnabled = false;

    const onInput = (chunk) => {
      ptyProcess.write(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    };
    const onResize = () => {
      ptyProcess.resize(options.stdout.columns || columns, Math.max(8, (options.stdout.rows || 24) - options.hudLines));
    };

    if (options.stdin.isTTY && typeof options.stdin.setRawMode === "function") {
      options.stdin.setRawMode(true);
      rawModeEnabled = true;
    }

    options.stdin.resume();
    options.stdin.on("data", onInput);
    if (typeof options.stdout.on === "function") {
      options.stdout.on("resize", onResize);
    }

    ptyProcess.onData((data) => {
      options.stdout.write(data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      options.stdin.off("data", onInput);
      if (typeof options.stdout.off === "function") {
        options.stdout.off("resize", onResize);
      }
      if (rawModeEnabled) {
        options.stdin.setRawMode(false);
      }
      resolve(Number.isInteger(exitCode) ? exitCode : 0);
    });
  });
}

export function resolveCodexLaunch(parsed, options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const codexBin = parsed.codex.bin;
  const codexArgs = parsed.codex.args;

  if (platform !== "win32") {
    return {
      args: codexArgs,
      bin: codexBin,
      displayName: codexBin,
    };
  }

  const extension = path.extname(codexBin).toLowerCase();
  if (extension === ".ps1") {
    const powershellBin = resolveWindowsExecutable(env.CODEX_HUD_POWERSHELL_BIN || "pwsh", env);
    return {
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", codexBin, ...codexArgs],
      bin: powershellBin,
      displayName: codexBin,
    };
  }

  if (extension === ".cmd" || extension === ".bat") {
    const commandProcessor = env.ComSpec || env.COMSPEC || "cmd.exe";
    return {
      args: ["/d", "/s", "/c", codexBin, ...codexArgs],
      bin: commandProcessor,
      displayName: codexBin,
    };
  }

  return {
    args: codexArgs,
    bin: codexBin,
    displayName: codexBin,
  };
}

export function resolveWindowsExecutable(command, env = process.env) {
  if (typeof command !== "string" || command.trim() === "") {
    return command;
  }

  const normalizedCommand = command.trim();
  if (path.isAbsolute(normalizedCommand) || /[\\/]/.test(normalizedCommand)) {
    return normalizedCommand;
  }

  const pathEntries = String(env.PATH || env.Path || "")
    .split(path.delimiter)
    .filter(Boolean);
  const pathExtensions = buildWindowsPathExtensions(normalizedCommand, env);

  for (const directory of pathEntries) {
    for (const extension of pathExtensions) {
      const candidate = path.join(directory, `${normalizedCommand}${extension}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return normalizedCommand;
}

export function resolveGlobalHudHome(env = process.env) {
  if (env.CODEX_HUD_HOME || env.HUD_HOME) {
    return path.resolve(env.CODEX_HUD_HOME || env.HUD_HOME);
  }

  if (env.LOCALAPPDATA) {
    return path.join(env.LOCALAPPDATA, "codex-hud");
  }

  if (env.XDG_STATE_HOME) {
    return path.join(env.XDG_STATE_HOME, "codex-hud");
  }

  const home = env.USERPROFILE || env.HOME || os.homedir();
  return path.join(home, ".codex-hud");
}

function buildWindowsPathExtensions(command, env) {
  if (path.extname(command)) {
    return [""];
  }

  const configured = String(env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
  const normalized = configured.length ? configured : [".COM", ".EXE", ".BAT", ".CMD"];
  return normalized.some((extension) => extension.toUpperCase() === ".EXE") ? normalized : [".EXE", ...normalized];
}
