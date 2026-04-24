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
- A future PTY wrapper or upstream Codex renderer API for exact in-conversation overlay behavior.

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
- `plugins/codex-hud/src/core/` owns event schemas, redaction, storage, and reduction.
- `plugins/codex-hud/src/terminal/` owns terminal-safe ANSI rendering.
- `plugins/codex-hud/src/daemon/` serves health, status, event, and stream endpoints.
- `plugins/codex-hud/src/ui/` contains the secondary Web HUD.

## Privacy

HUD data stays local under `.hud/`. Tool input and output are summarized and redacted before display, but diagnostics can still contain local paths and summaries. Do not share diagnostics unless you have reviewed them.
