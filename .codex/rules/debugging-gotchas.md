# Debugging Gotchas

## Hook Processes Do Not Guarantee Shared Process Identity

When testing Codex HUD manually, pre-tool and post-tool hook invocations initially produced different fallback session ids because the fallback included process identity. Separate hook processes can have different pids/parents even for one logical session.

Fix:

- Prefer explicit `CODEX_SESSION_ID` when present.
- When absent, fallback to a stable workspace hash instead of process identity.
- Cover this with a regression test that creates pre/post events without session env vars and asserts identical `sessionId`.

## HUD Status Requires the Explicit `codex-hub` Command

If the terminal shows Codex but no HUD status bar, first check whether the user launched `codex` or `codex-hub`. Plain `codex` is intentionally the upstream CLI; only `codex-hub` owns the terminal for bottom-bar rendering.

Fix:

- Run `Get-Command codex -All` before debugging renderer code.
- Install the managed PowerShell shim when `codex-hub` should be available globally.
- Verify `Get-Command codex-hub` resolves to a Function and `Get-Command codex` resolves to the upstream external script/application.
- Keep `codex-raw` as a bypass so upstream Codex can still be tested directly.
- When the shim forwards a Windows Codex path, support `.ps1/.cmd` explicitly and avoid auto PTY in non-TTY smoke tests.

## `node-pty` Does Not Resolve `pwsh` Like PowerShell

If `codex --hud-help` works but `codex --hud-no-status` fails with `codex-hud: File not found:`, the wrapper is active but the PTY launch path is broken.

Fix:

- Reproduce with a minimal `node-pty.spawn("pwsh", ...)` test.
- Resolve `pwsh` to an absolute `pwsh.exe` path through PATH/PATHEXT before passing it to `node-pty`.
- In PowerShell shims, set `CODEX_HUD_POWERSHELL_BIN` from the current PowerShell process path so PTY launch does not depend on PATH.
- Verify by launching `codex.ps1 --version` through `node-pty`, not only through stdio.

## Global HUD Must Not Write Under Protected CWDs

If `codex` works from a normal repo but fails from `C:\WINDOWS\system32` with `EPERM: operation not permitted, mkdir '.hud\events'`, the global wrapper is still using the current directory for HUD state.

Fix:

- For wrapper launches, default `CODEX_HUD_HOME` to `%LOCALAPPDATA%\codex-hud` unless the user explicitly set `CODEX_HUD_HOME` or `HUD_HOME`.
- Keep the child Codex `cwd` unchanged; only the HUD event store moves.
- Verify from `C:\WINDOWS\system32` with `codex-hub --hud-codex-bin node -- -e "process.exit(0)"`.

## Missing Tool Rows Can Be a Data Plane Problem

If the HUD shows runtime metadata but still says `Waiting for Codex hook events`, check the event store before changing renderer code.

Fix:

- Look for `%LOCALAPPDATA%\codex-hud\events\*.jsonl` when using the global wrapper.
- Show `0 events`, event file count, HUD store path, and cwd in the HUD so this failure boundary is visible.
- If the event store is empty, debug plugin/hook installation and hook command execution, not terminal rendering.
