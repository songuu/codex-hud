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

## 2026-04-24: Realtime Status Bar Requires Wrapper or Host Renderer

### Decision

Codex HUD should implement realtime bottom status through a wrapper-owned terminal renderer:

- Prefer a Codex host renderer adapter if a future API is detected.
- Use a PTY adapter when `node-pty` is available.
- Fall back to stdio when PTY is unavailable, with an explicit reduced-fidelity warning.
- Keep hook collection independent from wrapper rendering.

### Why

Codex hooks can observe lifecycle/tool events and can optionally print output, but they do not own the active terminal layout. A stable bottom status bar requires the process that controls the terminal to reserve and repaint those rows. Today that means a wrapper; in the future it can mean a Codex host renderer API.

### Consequences

- Users must launch via `codex-hub` for realtime status-bar behavior.
- Direct `codex` launches can still collect events, but cannot guarantee an always-visible bottom HUD.
- PTY support must be optional and isolated because Windows native dependencies can be fragile.
- Adapter selection and terminal repainting live under `src/wrapper/`, not in hooks.

## 2026-04-24: PowerShell `codex-hub` Is the Explicit HUD Shim

### Decision

PowerShell users should opt into a profile shim when they want a global HUD command:

- The shim leaves `codex` as the original upstream CLI.
- The shim maps `codex-hub` to `node plugins/codex-hud/scripts/codex-hud.mjs`.
- The shim keeps `codex-hud` as a compatibility alias for `codex-hub`.
- The shim forwards the original PowerShell-resolved Codex path through `CODEX_HUD_CODEX_BIN`.
- The shim also exposes `codex-raw` as an escape hatch to the original Codex command.
- The shim is installed and removed by an idempotent script with managed markers.

### Why

Codex plugins and hooks cannot reserve terminal rows when the upstream `codex` process owns the terminal. A separate `codex-hub` command makes terminal ownership explicit without changing the default upstream `codex` behavior.

### Consequences

- Plain `codex` should behave exactly like upstream Codex.
- The status bar appears when the user runs `codex-hub`.
- `codex-raw` must remain available for debugging upstream Codex behavior without HUD interference.
- The wrapper must support Windows `.ps1`, `.cmd`, and native executable Codex launch paths without relying on `shell: true`.
- Auto PTY selection must require real parent TTY streams; non-interactive commands should fall back to stdio.
- Installer code must avoid editing unrelated profile content and must support uninstall.

## 2026-04-24: Windows PTY Launches Need Absolute Shell Paths

### Decision

When the wrapper launches a PowerShell `.ps1` Codex shim on Windows, it must resolve `pwsh` to an absolute executable path before handing it to `node-pty`.

### Why

PowerShell command resolution can find `pwsh` through PATH or App Execution Alias, but `node-pty` does not reliably perform the same lookup. Passing the short command name caused interactive wrapper launches to fail with `File not found:` even though non-interactive stdio launches worked.

### Consequences

- `resolveCodexLaunch` must expand `pwsh` through PATH/PATHEXT on Windows.
- The PowerShell shim should pass `CODEX_HUD_POWERSHELL_BIN` using the current PowerShell process path so PTY launch does not depend on PATH.
- User-provided `CODEX_HUD_POWERSHELL_BIN` can still override the shell path.
- Regression tests should cover both direct executable resolution and `.ps1` Codex wrapper launch resolution.

## 2026-04-24: Codex HUD Global Command Is a User Profile Contract

### Decision

Global command support is implemented through managed PowerShell profile shims for the current user:

- `codex` remains the original upstream Codex CLI.
- `codex-hub` launches Codex through the HUD wrapper.
- `codex-hud` remains a compatibility alias for `codex-hub`.
- `codex-raw` bypasses the wrapper and calls the upstream Codex CLI.
- `codex-hub-doctor` and `codex-hud-doctor` report wrapper, Node, and raw Codex command resolution.
- `npm run codex-hud:install:global` installs the shim into PowerShell 7 and Windows PowerShell all-host/current-host profiles.

### Why

The wrapper must preserve the caller's current directory while loading its implementation from this repository. A profile shim is safer than overwriting the upstream npm `codex.ps1`/`codex.cmd` files and keeps a clear escape hatch for debugging upstream Codex behavior.

### Consequences

- Users should open a new PowerShell after global install, or dot-source `$PROFILE` for the current session.
- Global support is PowerShell-first on Windows; other shells need their own shell-specific shims.
- Wrapper-owned HUD state defaults to `%LOCALAPPDATA%\codex-hud` instead of `cwd\.hud`, because global commands must work from protected directories.
- All profile writes must be managed-marker idempotent and uninstallable.
- Verification should be performed from outside the repo root to catch cwd coupling.

## 2026-04-27: HUD Must Show Runtime Metadata Even Without Events

### Decision

The terminal HUD should render Codex runtime metadata from `~/.codex/config.toml` even before hook events arrive:

- Model, reasoning effort, and service tier form the model label.
- Project trust, sandbox mode, MCP count, enabled plugin count, local rules, hooks, event count, HUD store, event file count, and cwd are visible diagnostic state.
- Dense status fields should wrap onto a second HUD line instead of truncating key data.

### Why

When hook events are missing, showing only `[Codex]`, rules, MCPs, and hooks makes the HUD look incomplete and hides the actual failure boundary. The user needs enough context to tell whether the renderer, config discovery, or hook data plane is missing.

### Consequences

- The terminal renderer may read Codex config as read-only metadata.
- Hook event absence must be explicit (`0 events`, `0 event files`, store path).
- The first HUD lines are reserved for stable runtime/diagnostic state; tool rows may be fewer when dense metadata is present.
