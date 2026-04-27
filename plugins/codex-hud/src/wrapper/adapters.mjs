const ADAPTER_LABELS = {
  host: "host-renderer",
  pty: "node-pty",
  stdio: "stdio-fallback",
};

export function detectHostRenderer(env = process.env) {
  return env.CODEX_HUD_HOST_RENDERER_API === "1" || env.CODEX_HOST_RENDERER_API === "1";
}

export function selectRendererAdapter(options = {}) {
  const requested = options.requested || "auto";
  const env = options.env ?? process.env;
  const ptyAvailable = Boolean(options.ptyAvailable);
  const ptyUnavailableReason = options.ptyUnavailableReason || "node-pty is not installed";
  const hostAvailable = detectHostRenderer(env);

  if (requested === "host") {
    return adapterResult("host", hostAvailable, hostAvailable ? "host renderer API requested" : "Codex host renderer API is not available");
  }

  if (requested === "pty") {
    return adapterResult("pty", ptyAvailable, ptyAvailable ? "node-pty requested" : ptyUnavailableReason);
  }

  if (requested === "stdio") {
    return adapterResult("stdio", true, "stdio fallback requested");
  }

  if (hostAvailable) {
    return adapterResult("host", true, "host renderer API detected");
  }

  if (ptyAvailable) {
    return adapterResult("pty", true, "node-pty detected");
  }

  return adapterResult("stdio", true, `${ptyUnavailableReason}; using stdio fallback`);
}

export async function resolveRuntimeAdapter(options = {}) {
  const nodePty = await loadNodePty();
  const ttyAvailable = options.ttyAvailable !== false;
  const ptyAvailable = Boolean(nodePty) && ttyAvailable;
  const adapter = selectRendererAdapter({
    requested: options.requested,
    env: options.env,
    ptyAvailable,
    ptyUnavailableReason: nodePty ? "parent streams are not TTYs" : "node-pty is not installed",
  });

  return {
    ...adapter,
    nodePty: ptyAvailable ? nodePty : undefined,
  };
}

export async function loadNodePty() {
  try {
    const module = await import("node-pty");
    return module.default || module;
  } catch {
    return undefined;
  }
}

export function describeAdapter(adapter) {
  const label = adapter?.label || "unknown";
  const reason = adapter?.reason ? `: ${adapter.reason}` : "";
  return `${label}${reason}`;
}

function adapterResult(name, available, reason) {
  return {
    name,
    label: ADAPTER_LABELS[name] || name,
    available,
    reason,
  };
}
