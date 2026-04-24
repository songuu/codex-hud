---
title: "Codex HUD Terminal-First Plugin"
date: 2026-04-24
tags: [solution, codex, plugin, observability, terminal]
related_instincts: ["terminal-hud-requirement"]
aliases: ["Codex HUD", "codex-hud", "Codex terminal HUD"]
---

# Codex HUD Terminal-First Plugin

## Problem

Codex needs a local HUD similar to Claude Code `claude-hud`, and the primary experience must live in the conversation terminal rather than a separate Web dashboard. The implementation still must avoid coupling hook collection to unstable CLI internals or blocking the main agent flow.

## Root Cause

Codex plugin hooks are good observation points, but they are not a full terminal renderer API. Hook processes may also run separately, so any state model that relies on process identity will split one logical session. A Web sidecar validates data collection, but it does not satisfy the in-conversation HUD requirement.

## Solution

Use a terminal-first sidecar architecture:

```text
Codex hooks
  -> thin hook runner
  -> local JSONL event queue
  -> reducer-backed state
  -> Claude-style terminal renderer
  -> optional daemon/Web diagnostics
```

Key implementation points:

- Keep `scripts/hook-runner.mjs` defensive and timeout-friendly.
- Normalize raw hook payloads into a versioned `HudEvent`.
- Redact sensitive input/output summaries before display.
- Store events under `.hud/events/*.jsonl`.
- Render Claude-style terminal output through `scripts/hud-terminal.mjs`.
- Support opt-in inline hook output with `CODEX_HUD_RENDER=inline`.
- Serve `/health`, `/status`, `/events`, and `/stream` from a local daemon as a secondary diagnostics surface.
- Use a stable workspace-based fallback session id when Codex does not provide `CODEX_SESSION_ID`.
- Treat exact overlay/status-bar parity as requiring a Codex host renderer extension point or a PTY wrapper.

## Prevention

- Do not put heavy state or rendering logic inside Codex hooks.
- Do not treat a Web dashboard as satisfying the `claude-hud` requirement unless the user explicitly asks for Web.
- Treat hook payloads as unstable and isolate them behind adapters.
- Test both explicit session ids and fallback session ids.
- Add end-to-end smoke tests that run hook pre/post events and verify daemon state.

## Related

- [[2026-04-24-codex-hud-plugin]]
- [[architecture]]
- [[testing-patterns]]
