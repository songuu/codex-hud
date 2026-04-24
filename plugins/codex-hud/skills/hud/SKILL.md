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
npm run diagnostics
```

## Operating Notes

- The hook runner writes local events to `.hud/events/*.jsonl`.
- `CODEX_HUD_RENDER=inline` opts into hook-time terminal output.
- The terminal HUD is the primary UX; the Web HUD is secondary diagnostics.
- The daemon exposes `/health`, `/status`, `/events`, and `/stream`.
- Do not upload diagnostics unless the user explicitly asks; they may contain local paths and summarized tool inputs.
