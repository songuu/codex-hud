const VALID_ADAPTERS = new Set(["auto", "host", "pty", "stdio"]);

export function parseWrapperArgs(argv = [], options = {}) {
  const env = options.env ?? process.env;
  const wrapper = {
    adapter: "auto",
    codexBin: env.CODEX_HUD_CODEX_BIN || "codex",
    color: undefined,
    help: false,
    hudLines: 4,
    intervalMs: 500,
    status: true,
  };
  const codexArgs = [];
  let passThrough = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (passThrough) {
      codexArgs.push(arg);
      continue;
    }

    if (arg === "--") {
      passThrough = true;
    } else if (arg === "--hud-help") {
      wrapper.help = true;
    } else if (arg === "--hud-no-status") {
      wrapper.status = false;
    } else if (arg === "--hud-color") {
      wrapper.color = true;
    } else if (arg === "--hud-no-color") {
      wrapper.color = false;
    } else if (arg === "--hud-adapter") {
      wrapper.adapter = readEnumValue(argv, index, "--hud-adapter", VALID_ADAPTERS);
      index += 1;
    } else if (arg.startsWith("--hud-adapter=")) {
      wrapper.adapter = normalizeAdapter(arg.slice("--hud-adapter=".length));
    } else if (arg === "--hud-interval-ms") {
      wrapper.intervalMs = readNumberValue(argv, index, "--hud-interval-ms", 100, 60_000);
      index += 1;
    } else if (arg.startsWith("--hud-interval-ms=")) {
      wrapper.intervalMs = normalizeNumber(arg.slice("--hud-interval-ms=".length), "--hud-interval-ms", 100, 60_000);
    } else if (arg === "--hud-lines") {
      wrapper.hudLines = readNumberValue(argv, index, "--hud-lines", 1, 8);
      index += 1;
    } else if (arg.startsWith("--hud-lines=")) {
      wrapper.hudLines = normalizeNumber(arg.slice("--hud-lines=".length), "--hud-lines", 1, 8);
    } else if (arg === "--hud-codex-bin") {
      wrapper.codexBin = readStringValue(argv, index, "--hud-codex-bin");
      index += 1;
    } else if (arg.startsWith("--hud-codex-bin=")) {
      wrapper.codexBin = normalizeString(arg.slice("--hud-codex-bin=".length), "--hud-codex-bin");
    } else {
      codexArgs.push(arg);
    }
  }

  return {
    wrapper,
    codex: {
      bin: wrapper.codexBin,
      args: codexArgs,
    },
  };
}

export function renderWrapperHelp() {
  return `Codex HUD wrapper

Usage:
  node plugins/codex-hud/scripts/codex-hud.mjs [HUD options] -- [codex args]
  npm run codex-hub -- [HUD options] -- [codex args]

HUD options:
  --hud-help                 Show this help.
  --hud-adapter <auto|host|pty|stdio>
                             Select renderer adapter. Default: auto.
  --hud-no-status            Start Codex without drawing the HUD status bar.
  --hud-lines <n>            Reserve 1-8 terminal lines for the HUD. Default: 4.
  --hud-interval-ms <n>      Refresh interval. Default: 500.
  --hud-codex-bin <path>     Codex executable. Default: codex.
  --hud-color / --hud-no-color
                             Force or disable ANSI color.
`;
}

function readEnumValue(argv, index, label, validValues) {
  const value = readStringValue(argv, index, label);
  if (!validValues.has(value)) {
    throw new Error(`${label} must be one of: ${[...validValues].join(", ")}`);
  }
  return value;
}

function normalizeAdapter(value) {
  if (!VALID_ADAPTERS.has(value)) {
    throw new Error(`--hud-adapter must be one of: ${[...VALID_ADAPTERS].join(", ")}`);
  }
  return value;
}

function readNumberValue(argv, index, label, min, max) {
  return normalizeNumber(readStringValue(argv, index, label), label, min, max);
}

function normalizeNumber(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number`);
  }

  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function readStringValue(argv, index, label) {
  return normalizeString(argv[index + 1], label);
}

function normalizeString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} requires a value`);
  }
  return value.trim();
}
