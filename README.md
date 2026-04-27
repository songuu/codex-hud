# Codex HUD

Codex HUD is a repo-local, terminal-first plugin that observes Codex hook events and renders a Claude Code-style HUD for session status, tool timelines, failures, and diagnostics.

## Architecture

```text
Codex hooks
  -> scripts/hook-runner.mjs
  -> .hud/events/*.jsonl
  -> src/core reducer
  -> src/terminal Claude-style renderer
  -> scripts/hud-terminal.mjs
```

The daemon and Web HUD still exist as a secondary observability surface, but the primary UX is the terminal renderer. The hook runner is intentionally small and defensive. If HUD collection or rendering fails, Codex should keep running.

Important boundary: a Codex plugin can collect hook events and optionally print hook output. It cannot fully replace Codex's built-in terminal renderer unless Codex exposes a host UI extension point. For true inline status-bar behavior, use one of these paths:

- `CODEX_HUD_RENDER=inline` for opt-in hook-time terminal output.
- `npm run hud:terminal` for a live terminal companion that repaints a Claude-style HUD.
- `npm run codex-hub -- -- <codex args>` to launch Codex through the HUD wrapper.
- A future upstream Codex renderer API for exact native in-conversation overlay behavior.

## Usage

Validate the plugin:

```bash
npm run validate
```

Run tests:

```bash
npm test
```

Start the HUD:

```bash
npm run hud
```

Open `http://127.0.0.1:17384`.

Render the terminal HUD once:

```bash
npm run hud:once
```

Watch the terminal HUD:

```bash
npm run hud:terminal
```

Launch Codex with the realtime HUD wrapper:

```bash
npm run codex-hub -- --model gpt-5.5
```

Install the global PowerShell shim so `codex-hub` starts through the wrapper in new terminals from any directory:

```powershell
npm run codex-hud:install:global
```

This writes the managed shim to the current user's PowerShell 7 and Windows PowerShell profiles. For current-host-only installation, use:

```powershell
npm run codex-hud:install:powershell
```

Then open a new PowerShell terminal and run:

```powershell
codex-hub
```

The global shim exposes these commands:

```powershell
codex              # original upstream Codex CLI
codex-hub          # starts Codex through the HUD wrapper
codex-hud          # compatibility alias for codex-hub
codex-raw          # explicit upstream Codex bypass
codex-hub-doctor   # verifies global command resolution
```

The shim records the Codex command PowerShell would have used and passes it into the wrapper, so the HUD path does not silently switch to a different `codex.exe` on your `PATH`.
It also passes the current PowerShell executable path into the wrapper so `node-pty` does not need to find `pwsh` from `PATH`.

Global wrapper state is stored under your user profile by default:

```text
%LOCALAPPDATA%\codex-hud
```

This keeps `codex` working even when your current directory is not writable, such as `C:\WINDOWS\system32`. Set `CODEX_HUD_HOME` when you intentionally want a different HUD state directory.

The terminal HUD reads Codex runtime metadata from `~/.codex/config.toml`, including model, reasoning effort, service tier, project trust, sandbox mode, configured MCP servers, and enabled plugins. When hook events are not arriving yet, the HUD still shows the event store path, event file count, and current working directory so missing tool activity is diagnosable instead of silent.

The wrapper selects adapters in this order:

1. Codex host renderer API, when a future API is detected.
2. `node-pty`, when installed as an optional dependency.
3. stdio fallback, which is usable but cannot guarantee a stable bottom overlay in every terminal.

In non-interactive commands such as `codex --version`, auto mode skips PTY and uses stdio so CLI output stays clean.

Install optional PTY support when you want the wrapper to own a real pseudo-terminal:

```bash
npm install
```

Opt into inline hook output:

```bash
$env:CODEX_HUD_RENDER = "inline"
```

Export diagnostics:

```bash
npm run diagnostics
```

## Plugin Files

- `plugins/codex-hud/.codex-plugin/plugin.json` declares the Codex plugin.
- `plugins/codex-hud/hooks.json` registers lifecycle and tool hooks.
- `plugins/codex-hud/scripts/hook-runner.mjs` writes normalized local events.
- `plugins/codex-hud/scripts/hud-terminal.mjs` renders the Claude-style terminal HUD.
- `plugins/codex-hud/scripts/codex-hud.mjs` wraps `codex` and owns realtime status repainting.
- `plugins/codex-hud/src/core/` owns event schemas, redaction, storage, and reduction.
- `plugins/codex-hud/src/terminal/` owns terminal-safe ANSI rendering.
- `plugins/codex-hud/src/wrapper/` owns adapter selection, process launch, and bottom HUD supervision.
- `plugins/codex-hud/src/daemon/` serves health, status, event, and stream endpoints.
- `plugins/codex-hud/src/ui/` contains the secondary Web HUD.

## Privacy

HUD data stays local under `.hud/`. Tool input and output are summarized and redacted before display, but diagnostics can still contain local paths and summaries. Do not share diagnostics unless you have reviewed them.
