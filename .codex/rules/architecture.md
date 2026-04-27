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

## Realtime HUD Needs Terminal Ownership

For "start Codex and immediately show a bottom status bar", use the `codex-hub` wrapper command. Plugin hooks alone can collect events but cannot reserve terminal rows.

Implications:

- Wrapper adapter order is host renderer API -> `node-pty` -> stdio fallback.
- Direct `codex` runs are intentionally upstream-only; exact realtime bottom-bar behavior requires launching through `codex-hub` or `scripts/codex-hud.mjs`.
- Keep future host renderer integration behind `src/wrapper/adapters.mjs`.

## PowerShell `codex-hub` Uses a Managed Shim

When users expect the HUD, install the PowerShell profile shim and tell them to run `codex-hub`. Plain `codex` must remain the original upstream CLI.

Implications:

- New terminals are required after installation because PowerShell profiles load at shell startup.
- The shim must be idempotent and marker-managed so it does not overwrite unrelated profile content.
- The shim must not define `global:codex`; it should remove stale `codex` functions left by older shim versions.
- The shim should expose `codex-hub` as the primary wrapper command and keep `codex-hud` only as a compatibility alias.
- The shim should pass PowerShell's original Codex path via `CODEX_HUD_CODEX_BIN`, and the launcher must handle `.ps1/.cmd` without `shell: true`.
- Auto PTY selection requires real parent TTY streams; non-interactive checks should use stdio.
- Do not modify upstream Codex files; keep interception at the shell/profile layer.
