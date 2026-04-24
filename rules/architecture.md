# Architecture Decisions

## 2026-04-24: Codex HUD Plugin Uses Sidecar Architecture

### Decision

Codex HUD should use a sidecar architecture:

- Codex plugin hooks collect lifecycle/tool events.
- A local append-only event queue stores normalized observations.
- A local daemon reduces events into session state and serves status/stream APIs.
- The HUD UI consumes daemon APIs and remains replaceable.

### Why

Codex plugin hooks are a good sensor layer, but they should not own heavy state, UI rendering, or long-running work. Keeping hooks thin prevents HUD failures from blocking Codex. A daemon boundary also isolates unstable hook payload details from the display layer and leaves room for future adapters such as session files, logs, MCP, or a CLI wrapper.

### Consequences

- Hook scripts must be short, defensive, and timeout-bound.
- Internal event schemas must be versioned.
- Sensitive payloads must be summarized or redacted before display.
- Token/cost fields must remain optional unless Codex exposes a stable source.
- The first implementation should support manual daemon startup before adding automatic lifecycle management.

## 2026-04-24: Codex HUD Is Terminal-First, Web Is Secondary

### Decision

Codex HUD should prioritize the in-terminal conversation experience over a separate Web dashboard:

- Keep hook collection and JSONL reduction as the data plane.
- Add a pure terminal renderer that emits Claude Code-style compact status lines.
- Support opt-in inline hook output with `CODEX_HUD_RENDER=inline`.
- Keep daemon/Web APIs as diagnostics and secondary views, not the primary product surface.
- Treat exact overlay/status-bar behavior as requiring either a Codex host renderer extension point or a PTY wrapper.

### Why

The desired UX is during the conversation, visually aligned with Claude Code's terminal HUD. A Web sidecar proves data collection but does not satisfy the core interaction requirement. Hooks can observe and optionally print, but they are not a full terminal renderer API, so the terminal layer must be explicit and isolated.

### Consequences

- Rendering must be ANSI/TTY-aware and safe to disable.
- Hook-time rendering must remain optional so it does not corrupt command output.
- The terminal renderer should consume reduced state, not raw hook payloads.
- Future work should choose between upstream Codex UI integration and a PTY wrapper before promising exact inline overlay parity.
