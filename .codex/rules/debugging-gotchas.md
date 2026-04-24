# Debugging Gotchas

## Hook Processes Do Not Guarantee Shared Process Identity

When testing Codex HUD manually, pre-tool and post-tool hook invocations initially produced different fallback session ids because the fallback included process identity. Separate hook processes can have different pids/parents even for one logical session.

Fix:

- Prefer explicit `CODEX_SESSION_ID` when present.
- When absent, fallback to a stable workspace hash instead of process identity.
- Cover this with a regression test that creates pre/post events without session env vars and asserts identical `sessionId`.
