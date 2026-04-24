# Architecture Rules

## Codex HUD Uses a Sidecar Boundary

Codex HUD should keep hooks as a sensor layer only. Hooks collect lifecycle/tool events and write normalized JSONL records; daemon/UI layers own aggregation, streaming, and presentation.

Why:

- Hook failures must not block Codex.
- UI and daemon lifecycles are different from hook lifecycles.
- Codex hook payloads may evolve, so adapters need to isolate raw data from display state.

Implications:

- Hook scripts should be short, defensive, and safe to fail.
- Internal event schemas need a `schemaVersion`.
- Session identity must prefer `CODEX_SESSION_ID`, with stable workspace fallback.
- Token/cost fields stay optional until Codex exposes a reliable source.

## Codex HUD Is Terminal-First

When the requirement is "like Claude Code claude-hud," treat the primary surface as the conversation terminal, not a Web dashboard. Keep Web/daemon views as secondary diagnostics.

Implications:

- Add display behavior in `src/terminal/` as a pure renderer over reduced state.
- Use optional inline hook output (`CODEX_HUD_RENDER=inline`) only when the user accepts terminal output noise.
- Do not promise exact status-bar overlay parity unless Codex exposes a host renderer API or the project adds a PTY wrapper.
- Preserve thin hooks: rendering failures must not break Codex execution.
