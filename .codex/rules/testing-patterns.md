# Testing Patterns

## Codex Plugin Sidecar Tests

For a local Codex plugin with hook collection and sidecar daemon:

- L2/L3 unit tests should cover event normalization, redaction, JSONL storage, reducer pairing, and fallback session ids.
- Integration tests should start the daemon on an ephemeral port and assert `/health` and `/status`.
- Smoke tests should run the hook runner with synthetic pre/post payloads and verify `/status` aggregates one completed tool call.
- Manifest validation should check `.codex-plugin/plugin.json`, `hooks.json`, and marketplace entries for required fields and unresolved TODO placeholders.
