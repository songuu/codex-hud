---
title: "Codex HUD Realtime Wrapper"
type: sprint
status: completed
created: "2026-04-24"
updated: "2026-04-24"
checkpoints: 0
tasks_total: 6
tasks_completed: 6
tags: [sprint, feature, terminal, pty, codex-hud, completed]
aliases: ["realtime codex hud", "codex-hud wrapper"]
---

# Codex HUD Realtime Wrapper

## 需求分析

### 本次要做

- 启动 Codex 时自动出现底部状态栏，并随着 hook 事件实时更新。
- 采用 PTY wrapper 主线；当前 Codex plugin 未暴露 host renderer API，不能靠插件直接稳定占用终端底部。
- 保留 host renderer adapter 边界，未来 Codex 开放 renderer API 时可替换 PTY wrapper。
- 继续复用已有 hook -> JSONL -> reducer -> terminal renderer 数据链路。

### 本次不做

- 不承诺原生 `codex` 命令在没有 wrapper/alias 的情况下被插件强行改造。
- 不引入强制 native 依赖；`node-pty` 可以作为可选增强，但第一版要能无依赖运行。
- 不实现完整终端仿真器或修改 Codex CLI 内部源码。
- 不上传或外发 HUD 事件数据。

### 成功标准

- [x] 提供一个 wrapper 命令，可用 `npm run codex-hud -- <codex args>` 或脚本直接启动 Codex。
- [x] wrapper 启动后立即渲染底部 HUD，并按事件文件变化或定时器实时刷新。
- [x] 如果可用 `node-pty`，走 PTY 适配；不可用时明确降级为 stdio fallback，仍保留实时 HUD 输出。
- [x] 有 host renderer adapter 占位和能力检测，不把未来 API 逻辑散落在脚本里。
- [x] README/skill 说明如何让用户用 wrapper 替代直接 `codex` 启动。
- [x] 测试覆盖 wrapper 参数解析、adapter 选择、HUD repaint 控制和无事件状态。

### 风险和假设

- 当前 `codex --help` 和 `codex plugin --help` 未显示 host renderer/plugin UI API。
- `features list` 中 `realtime_conversation` 为 under development 且默认 false，不能当作可用渲染 API。
- Windows 下真正 PTY 需要 native 依赖；不应在 MVP 中强制安装。
- 底部状态栏如果与 Codex TUI 的 alternate screen 争用，必须提供 fallback 和文档说明。

## 技术方案

### 架构决策

采用 **wrapper-first + adapter boundary**：

```text
codex-hud wrapper
  -> renderer adapter selector
     -> host renderer adapter (future/noop until Codex exposes API)
     -> PTY adapter (optional node-pty)
     -> stdio fallback adapter
  -> spawn codex
  -> realtime HUD supervisor
  -> renderTerminalHud(status)
```

### 模块边界

- `src/wrapper/args.mjs`：解析 wrapper 参数，分离 wrapper flags 与 Codex args。
- `src/wrapper/adapters.mjs`：选择 `host-renderer` / `node-pty` / `stdio-fallback`。
- `src/wrapper/hud-supervisor.mjs`：监听 `.hud/events`，定时刷新，输出底部 HUD frame。
- `scripts/codex-hud.mjs`：用户入口，启动 wrapper。
- `src/terminal/claude-style.mjs`：继续只做纯渲染。

### 测试策略

风险等级：L2。影响进程启动和终端输出，但不修改核心数据模型，也不触碰远端或持久数据。

- 单元测试：args/adapters/supervisor frame 输出。
- 冒烟测试：`npm run codex-hud -- --help` 不启动真实交互 Codex，只验证 wrapper help。
- 现有 core/terminal/daemon 测试继续跑。

## 任务拆解

- [x] **Task 1**: 实现 wrapper 参数解析和 adapter 选择。
- [x] **Task 2**: 实现 realtime HUD supervisor，支持 bottom/status frame 刷新和 cleanup。
- [x] **Task 3**: 实现 `scripts/codex-hud.mjs`，优先 PTY、fallback stdio，注入 HUD 环境变量。
- [x] **Task 4**: 更新 npm scripts、validate、README、skill 和架构规则。
- [x] **Task 5**: 增加 L2 测试并跑验证。
- [x] **Task 6**: Review + Compound 沉淀本次 wrapper/API 边界经验。

## 变更日志

- 2026-04-24: 创建 sprint 文档，确认当前 Codex 无公开 host renderer/plugin UI API，采用 PTY wrapper 主线。
- 2026-04-24: 新增 `src/wrapper/*`、`scripts/codex-hud.mjs`、`npm run codex-hud`，实现 adapter selection、实时 HUD supervisor、PTY/stdin fallback launcher。
- 2026-04-24: 新增 `tests/wrapper.test.mjs`，覆盖参数解析、adapter 顺序、HUD frame、bottom overlay、child env、无 shell 参数转发和 fallback 输出。
- 2026-04-24: 修复 Windows `shell: true` 参数转发导致的 Node DEP0190 安全警告，改为 `shell: false` 并用测试覆盖。
- 2026-04-24: `node-pty` 确认为 npm 当前版本 `1.1.0`，已加入 `optionalDependencies`。
- 2026-04-24: 用户在新 PowerShell 中运行裸 `codex` 后未出现状态栏，确认根因是 shell 仍解析到官方 `codex.ps1`；新增 PowerShell profile shim 安装器，把 plain `codex` 映射到 HUD wrapper，并保留 `codex-raw` 绕过入口。
- 2026-04-24: 修复 shim 后续发现的 Windows 启动细节：shim 通过 `CODEX_HUD_CODEX_BIN` 传入 PowerShell 原本解析到的 Codex 路径；launcher 支持 `.ps1/.cmd` 启动且 auto PTY 只在父流为 TTY 时启用，非交互 `--version/--help` 走 stdio。

## 审查结果

### P0 — 必须修复

无。

### P1 — 建议修复

无。已在 Work 中修复 `shell: true` 参数转发警告，避免 wrapper 在 Windows 下通过 shell 拼接 Codex 参数。

### P2 — 可选优化

| # | 视角 | 文件:行 | 问题 |
|---|------|---------|------|
| 1 | 真实 PTY 体验 | `plugins/codex-hud/src/wrapper/launcher.mjs` | 当前 PTY 适配依赖可选 `node-pty`。未执行 `npm install` 时自动降级为 stdio fallback；要达到更像 Claude Code 的稳定底部状态栏，需要安装 native 可选依赖并在真实 TTY 中手测。 |
| 2 | Host API | `plugins/codex-hud/src/wrapper/adapters.mjs` | host renderer adapter 目前是边界占位；本机 Codex 0.124.0-alpha.2 未暴露 plugin renderer API。未来 API 出现后需把真实握手/渲染接入 adapter。 |
| 3 | 终端兼容性 | `plugins/codex-hud/src/wrapper/hud-supervisor.mjs` | bottom overlay 使用 ANSI save/restore cursor 和固定底部行。不同终端、alternate screen、tmux/zellij 下仍需真实交互验证。 |

### 测试覆盖评估

| 模块 | 风险 | 应测等级 | 实际覆盖 | 结论 |
|------|------|----------|----------|------|
| `src/wrapper/args.mjs` | L2 | 标准 | HUD flags 与 Codex args 分离、help 文档 | 充分 |
| `src/wrapper/adapters.mjs` | L2 | 标准 | host/pty/stdio 选择顺序和显式 PTY 不可用 | 充分 |
| `src/wrapper/hud-supervisor.mjs` | L2 | 标准 | frame 生成、bottom overlay、非 TTY fallback、无事件状态 | 充分 |
| `src/wrapper/launcher.mjs` | L2 | 标准 | child env、stdio spawn options、禁用 shell 参数转发 | 充分 |
| `scripts/codex-hud.mjs` | L1 | 冒烟 | `--hud-help` 和转发 `codex --help` | 可接受 |

### 验证证据

- `codex --help`、`codex features list`、`codex plugin --help`：未发现当前可用 host renderer/plugin UI API。
- `npm view node-pty version` 返回 `1.1.0`。
- `npm run validate` 通过。
- `npm test` 通过，23/23 tests pass。
- `node --check` 通过：`scripts/codex-hud.mjs`、`src/wrapper/args.mjs`、`src/wrapper/adapters.mjs`、`src/wrapper/hud-supervisor.mjs`、`src/wrapper/launcher.mjs`。
- `npm run codex-hud -- --hud-help` 成功输出 wrapper help。
- `npm run codex-hud -- --hud-no-status --help` 成功转发到 Codex CLI，且不再出现 Node `DEP0190` 警告。
- `Get-Command codex -All` 显示当前 plain `codex` 优先解析到 `C:\Users\songyu\AppData\Roaming\npm\codex.ps1`，未经过 HUD wrapper。
- `Test-Path node_modules\node-pty` 返回 `True`，当前仓库具备 PTY adapter 运行条件。
- 安装 shim 后 `Get-Command codex` 显示 `CommandType: Function`，`codex --hud-help` 输出 HUD wrapper help。
- `codex --hud-no-status --version` 与 `codex-raw --version` 均返回 Codex CLI 版本，确认 wrapper 转发和 bypass 都可用。

## 复利记录

### 产出

- 架构决策：2 个 — `rules/architecture.md`, `.codex/rules/architecture.md`
- 新增 wrapper 模块：4 个 — `args.mjs`, `adapters.mjs`, `hud-supervisor.mjs`, `launcher.mjs`
- 新增入口脚本：2 个 — `scripts/codex-hud.mjs`, `scripts/install-powershell-shim.mjs`
- 新增测试：1 个 — `tests/wrapper.test.mjs`
- 文档更新：2 个 — `README.md`, `plugins/codex-hud/skills/hud/SKILL.md`
- Skill 信号：2 个 — `skill-signals/sprint.jsonl`, `skill-signals/test-strategy.jsonl`

### 提取的经验

- 实时底部 HUD 需要终端所有权；plugin hook 只能观察或打印，不能稳定保留底部状态栏。
- PTY adapter 要隔离为可选增强；没有 native 依赖时必须有可解释的 fallback。
- Windows wrapper 不能用 `shell: true` 拼接 Codex 参数，容易触发安全警告并扩大参数注入风险。
- Host renderer API 尚不存在时，应保留 adapter 边界，不把未来 API 假设散落进业务逻辑。
- 用户输入的是 plain `codex` 时，问题通常在 shell 命令解析层；先查 `Get-Command codex -All`，再判断 wrapper 是否实际接管。
- PowerShell shim 不能假设 Node 的 PATH 解析会命中同一个 Codex；要显式传递 shell 原始解析结果。
- PTY 是交互终端能力，不应在非 TTY smoke test 中自动启用。

### 后续 Backlog

- 安装并实机验证 `node-pty` adapter 的交互体验，包括 alternate screen、窗口 resize、Ctrl-C、Ctrl-D。
- 如果 Codex 发布 host renderer API，把 `src/wrapper/adapters.mjs` 的 host 分支替换为真实握手。
- 实机验证 PowerShell shim 后的启动路径：新终端 `Get-Command codex` 应显示 Function，`codex-raw --help` 应绕过 HUD。
