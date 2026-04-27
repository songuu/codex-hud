---
name: hud
description: Inspect, start, or diagnose the local Codex HUD terminal plugin.
---

# Codex HUD

Use this skill when the user asks about Codex HUD status, wants to start the terminal HUD, or needs a diagnostics export.

## Commands

Run from the repository root:

```bash
npm run hud:terminal
```

The terminal renderer watches `.hud/events/*.jsonl` and repaints a Claude Code-style HUD.

To start Codex with the realtime HUD wrapper:

```bash
npm run codex-hub -- --model gpt-5.5
```

To make `codex-hub` start through the wrapper in new PowerShell terminals from any directory:

```powershell
npm run codex-hud:install:global
```

For current-host-only PowerShell installation:

```powershell
npm run codex-hud:install:powershell
```

The global shim leaves `codex` as the original upstream CLI and adds `codex-hub`, `codex-hud`, `codex-raw`, `codex-hub-doctor`, and `codex-hud-doctor`.
Use `codex-hub` when the status bar should be attached to Codex startup.
Use `codex-hub-doctor` to verify that the wrapper, Node, and raw Codex path resolve correctly.
It also forwards the Codex path PowerShell originally resolved, avoiding a silent switch to another `codex.exe` on `PATH`.
Global wrapper state defaults to `%LOCALAPPDATA%\codex-hud`, so the HUD works from protected directories such as `C:\WINDOWS\system32`. Set `CODEX_HUD_HOME` to override it.
The renderer also reads `~/.codex/config.toml` for model, reasoning effort, service tier, project trust, sandbox, MCP server count, and enabled plugin count. If hook events are absent, it should show `0 events`, event file count, HUD store path, and cwd instead of hiding the missing data plane.

The wrapper prefers a future Codex host renderer API, then optional `node-pty`, then stdio fallback. Auto mode only selects PTY when the parent streams are real TTYs. Direct `codex` startup cannot be made to reserve a bottom status bar by plugin hooks alone.

Run `npm install` first when PTY support is desired; `node-pty` is an optional dependency and the wrapper still works without it in stdio fallback mode.

For Web diagnostics:

```bash
npm run hud
```

The daemon listens on `http://127.0.0.1:17384` by default.

Useful commands:

```bash
npm run validate
npm test
npm run hud:once
npm run codex-hub -- --hud-help
npm run codex-hud:install:global
npm run codex-hud:install:powershell -- --dry-run
npm run diagnostics
```

## Operating Notes

- The hook runner writes local events to `.hud/events/*.jsonl`.
- `CODEX_HUD_RENDER=inline` opts into hook-time terminal output.
- `scripts/codex-hud.mjs` is the realtime entry point behind the `codex-hub` command.
- `scripts/install-powershell-shim.mjs` installs the optional shell function that maps `codex` to the wrapper.
- The terminal HUD is the primary UX; the Web HUD is secondary diagnostics.
- The daemon exposes `/health`, `/status`, `/events`, and `/stream`.
- Do not upload diagnostics unless the user explicitly asks; they may contain local paths and summarized tool inputs.
