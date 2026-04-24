---
title: "Codex HUD Plugin"
type: sprint
status: completed
created: "2026-04-24"
updated: "2026-04-24"
checkpoints: 0
tasks_total: 8
tasks_completed: 8
tags: [sprint, feature, architecture, plugin, completed]
aliases: ["codex-hud", "Codex HUD"]
---

# Codex HUD Plugin

## 需求分析

### 本次要做

- 设计一个 Codex 版 HUD 插件架构，目标是提供类似 Claude Code `claude-hud` 的运行态可观测体验。
- 明确插件边界：哪些能力放在 Codex plugin 内，哪些能力放在旁路服务、TUI 或 Web UI 内。
- 定义事件采集、状态归一化、展示层、配置、持久化和扩展点的职责。
- 收敛 MVP 范围，让后续可以按 Plan -> Work -> Review 实现。

### 需求修正

- 2026-04-24 用户澄清：Web HUD 只是效果验证，真实目标是对话过程中的终端 HUD，视觉和交互需要贴近 Claude Code 终端样式。
- 架构主视角从“Web sidecar dashboard”调整为“terminal-first HUD”；daemon/Web 仅作为诊断与次级视图。

### 本次不做

- 不直接复刻 Claude Code 内部私有能力或未公开协议。
- 不先做复杂多用户、云同步、团队看板、鉴权系统。
- 不在 Phase 1 直接 scaffold 插件或写业务代码。
- 不把 HUD 做成强耦合 Codex CLI 的不可替换补丁。

### 成功标准

- [ ] 能说清 Codex HUD 的核心用户、核心场景和 MVP。
- [ ] 能选定一条主架构路线，并说明为什么。
- [ ] 能区分采集层、状态层、展示层、插件分发层的职责。
- [ ] 能给出后续实现任务拆解、风险和测试策略。
- [ ] 架构能兼容未来接入 hooks、skills、MCP、session 文件或日志源。

### 风险和假设

- 假设 Codex 插件当前主要由 `.codex-plugin/plugin.json`、skills、hooks、scripts、MCP/app 配置等组成，不能假设存在 Claude Code 完全相同的 HUD API。
- 假设 HUD 需要尽量旁路化，不应阻塞 Codex 主流程。
- 假设第一版更重视本地开发者可用性，而不是云端协作。
- 风险：Codex 日志、session、hook 事件的稳定性可能不足，需要用适配层隔离。
- 风险：如果展示层直接绑定某一种数据源，后续迁移成本会很高。

### 验收条件

- [ ] 产出一份架构方案，包含 2-3 个可选路线和推荐路线。
- [ ] 产出模块边界图或文字版组件关系。
- [ ] 产出 MVP 功能清单和非目标清单。
- [ ] 产出实现任务清单，且每个任务能独立验证。
- [ ] 产出测试策略，覆盖事件解析、状态聚合、展示层冒烟和插件清单校验。

## 技术方案

### 方案概述

Codex HUD 不应做成 Codex CLI 的强侵入补丁。推荐架构是：**Codex 插件作为事件采集层，本地 HUD daemon 作为状态聚合层，Web/TUI 作为展示层**。插件只负责在 `SessionStart`、`PreToolUse`、`PostToolUse`、`Stop`、`SessionEnd` 等 hook 点采集事件，并将事件写入本地 append-only 队列；daemon 负责解析、归一化、脱敏、聚合 session 状态；UI 通过本地 HTTP/SSE 或 WebSocket 订阅状态。

这个架构的核心原则是旁路化：HUD 出问题时最多丢失观测数据，不能阻塞 Codex 主流程。hook 脚本必须短小、容错、可异步，复杂逻辑全部下沉到 core/daemon。

### 备选方案

#### 方案 A：纯 Codex 插件 + JSONL 记录

- 结构：`.codex-plugin/plugin.json` + `hooks.json` + `scripts/observe` + `skills/hud`。
- 能力：采集 hook 事件，写入本地 JSONL，提供 skill 查询最近 session。
- 优点：最简单，最贴合 Codex plugin 分发模型，MVP 很快可用。
- 缺点：没有真正实时 HUD，交互和可视化弱。
- 适用：先验证 hook payload、事件模型和数据价值。

#### 方案 B：插件采集 + 本地 daemon + Web/TUI HUD（推荐）

- 结构：插件负责采集，daemon 负责状态服务，UI 负责展示。
- 能力：实时 session 面板、工具调用 timeline、错误/耗时提示、任务/phase 状态、导出和回放。
- 优点：解耦清晰，展示层可替换，后续能接 MCP、session 文件、日志源。
- 缺点：比纯插件多一个本地进程和生命周期管理。
- 适用：目标就是做类似 `claude-hud` 的长期可扩展体验。

#### 方案 C：`codex-hud` CLI wrapper

- 结构：用户运行 `codex-hud`，wrapper 启动 `codex` 并解析 stdout/stderr/session 文件。
- 能力：理论上可以获得更完整的实时过程控制。
- 优点：用户入口统一，能做启动/停止/面板联动。
- 缺点：最脆弱，容易随 Codex CLI 输出变化失效，也可能影响原生使用习惯。
- 适用：后续增强，不建议作为 MVP 主线。

### 推荐模块边界

```text
plugins/codex-hud/
  .codex-plugin/plugin.json        # 插件 manifest
  hooks.json                       # Codex hook 注册
  skills/hud/SKILL.md              # 查询、启动、诊断 HUD 的 skill 入口
  scripts/hook-runner.mjs          # 极薄采集脚本：读 hook payload -> 写事件队列
  scripts/hud-daemon.mjs           # 本地 daemon 启动入口
  scripts/hud-terminal.mjs         # Claude 风格终端 HUD 入口
  src/core/                        # 事件 schema、脱敏、reducer、store
  src/daemon/                      # 本地 API、SSE/WS、文件 tail、进程锁
  src/terminal/                    # 终端 ANSI 渲染层
  src/ui/                          # 次级 Web 展示层

.agents/plugins/marketplace.json   # repo-local marketplace，可选
rules/architecture.md              # 架构决策记录
```

### 数据流

```text
Codex hook
  -> hook-runner
  -> append-only event queue (.hud/events/*.jsonl)
  -> hud-core normalize/reduce
  -> hud-terminal Claude-style renderer
  -> optional hud-daemon SessionState API
  -> optional hud-ui timeline/status panels
```

### 事件模型

内部统一为 `HudEvent`，隔离 Codex hook 原始 payload 的不稳定性：

```ts
type HudEvent = {
  schemaVersion: 1;
  eventId: string;
  timestamp: string;
  source: "codex-hook" | "session-file" | "manual";
  phase: "session-start" | "pre-tool" | "post-tool" | "stop" | "session-end";
  sessionId: string;
  cwd: string;
  toolName?: string;
  toolStatus?: "started" | "succeeded" | "failed" | "unknown";
  durationMs?: number;
  inputSummary?: string;
  outputSummary?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};
```

### MVP 功能

- 实时显示当前 session、工作目录、最近活动时间。
- 显示工具调用 timeline：工具名、开始/结束、耗时、失败状态。
- 显示当前 sprint/plan/work/review 阶段提示，但不强依赖这些 workflow。
- 本地 JSONL 持久化，支持回放最近 session。
- 提供 `hud` skill：查看状态、启动 daemon、导出诊断包。
- 对敏感字段做默认脱敏，不展示完整 tool input/output。

### 非目标

- 不读取或上传用户代码内容到远端。
- 不承诺 token 统计准确性；如果 Codex 不提供稳定来源，则显示 unknown。
- 不实现团队云端看板、账号体系、权限系统。
- 不替换 Codex 原生命令，也不要求用户必须通过 wrapper 启动 Codex。

## 任务拆解

- [x] **Task 1**: 初始化插件骨架与基础 Node/TypeScript 工程 — 文件: `plugins/codex-hud/.codex-plugin/plugin.json`, `package.json`, `tsconfig.json`
- [x] **Task 2**: 实现 `hud-core` 事件 schema、脱敏、JSONL store 和 reducer — 文件: `plugins/codex-hud/src/core/*`
- [x] **Task 3**: 实现 hook runner 与 `hooks.json`，覆盖 session/tool/stop 生命周期 — 文件: `plugins/codex-hud/scripts/hook-runner.mjs`, `plugins/codex-hud/hooks.json`
- [x] **Task 4**: 实现本地 daemon：读取事件队列、聚合 `SessionState`、暴露 health/status/stream API — 文件: `plugins/codex-hud/src/daemon/*`, `plugins/codex-hud/scripts/hud-daemon.mjs`
- [x] **Task 5**: 实现 MVP HUD UI：session 状态、tool timeline、错误/耗时视图 — 文件: `plugins/codex-hud/src/ui/*`
- [x] **Task 6**: 实现 `hud` skill 和诊断/导出脚本 — 文件: `plugins/codex-hud/skills/hud/SKILL.md`, `plugins/codex-hud/scripts/export-diagnostics.mjs`
- [x] **Task 7**: 完成 marketplace、README、验证脚本和端到端冒烟 — 文件: `.agents/plugins/marketplace.json`, `README.md`, `plugins/codex-hud/scripts/validate.mjs`
- [x] **Task 8**: 增加 Claude 风格 terminal renderer、终端 watch 命令、hook inline opt-in 和测试 — 文件: `plugins/codex-hud/src/terminal/*`, `plugins/codex-hud/scripts/hud-terminal.mjs`, `tests/terminal.test.mjs`

> Task 超过 5 个。进入 Work 后，完成 Task 5 时建议做一次 checkpoint，再继续 Task 6-7。

### 测试策略

- 单元测试（L2/L3）：覆盖事件 schema 校验、hook payload 适配、脱敏逻辑、JSONL store、reducer 幂等性。
- 集成测试（L2）：用 fixture 模拟 `SessionStart`、`PreToolUse`、`PostToolUse`、`Stop`，验证事件落盘和状态聚合。
- UI 冒烟（L1/L2）：启动 daemon 和 UI，验证空状态、实时事件、错误事件、长工具调用状态。
- 插件校验（L2）：校验 `.codex-plugin/plugin.json`、`hooks.json`、marketplace entry 的必填字段和相对路径。
- 手动验证：安装 repo-local marketplace，启动 Codex session，确认 HUD 不阻塞 Codex，且 hook 失败时主流程继续。

### 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Codex hook payload 或环境变量不稳定 | 中 | 高 | 用 adapter 隔离原始 payload，fixture 固化观察到的格式 |
| hook 脚本阻塞 Codex 主流程 | 中 | 高 | hook runner 极薄化，异步写入，超时短，失败吞掉并记录 |
| 敏感信息泄漏到 HUD | 中 | 高 | 默认摘要化和脱敏，完整 payload 只进本地诊断且可关闭 |
| daemon 生命周期复杂 | 中 | 中 | MVP 先支持手动启动和 health check，后续再做自动拉起 |
| token/成本统计来源不稳定 | 高 | 中 | MVP 不承诺准确 token，字段设计为可选 |
| Windows/macOS/Linux 路径差异 | 中 | 中 | 路径处理集中在 core，测试覆盖 Windows 路径 |

### 涉及文件

- `package.json`
- `tsconfig.json`
- `plugins/codex-hud/.codex-plugin/plugin.json`
- `plugins/codex-hud/hooks.json`
- `plugins/codex-hud/skills/hud/SKILL.md`
- `plugins/codex-hud/scripts/hook-runner.mjs`
- `plugins/codex-hud/scripts/hud-daemon.mjs`
- `plugins/codex-hud/scripts/hud-terminal.mjs`
- `plugins/codex-hud/scripts/export-diagnostics.mjs`
- `plugins/codex-hud/scripts/validate.mjs`
- `plugins/codex-hud/src/core/*`
- `plugins/codex-hud/src/daemon/*`
- `plugins/codex-hud/src/terminal/*`
- `plugins/codex-hud/src/ui/*`
- `.agents/plugins/marketplace.json`
- `rules/architecture.md`
- `README.md`

## 变更日志

- 2026-04-24: 创建 sprint 文档并完成 Phase 1 需求分析。
- 2026-04-24: 完成 Phase 2 技术方案、任务拆解、测试策略和风险评估；记录 sidecar 架构决策。
- 2026-04-24: 完成 Phase 3 Work，实现方案 B 的插件采集、事件核心、daemon、Web HUD、skill、诊断、校验和测试。
- 2026-04-24: 测试记录：`npm run validate` 通过；`npm test` 9/9 通过；新增 terminal renderer 和 terminal script 的 `node --check` 通过；`npm run hud:once` 成功输出 Claude 风格终端 HUD 快照；此前 `npm run diagnostics` 成功导出，HUD daemon 已在 `http://127.0.0.1:17384` 通过 `/health` 探测。
- 2026-04-24: 端到端冒烟发现无 `CODEX_SESSION_ID` 时 fallback session 不稳定，已改为按 workspace 稳定聚合，并用回归测试覆盖；`/status` 确认 `self-test` pre/post 事件聚合到同一 session。
- 2026-04-24: 用户澄清真实目标是对话中的 Claude Code 风格终端 HUD；已新增 terminal-first renderer、`hud-terminal` 命令、hook inline opt-in，并将 Web HUD 降级为 secondary diagnostics surface。

## 审查结果

### P0 — 必须修复

无。

### P1 — 建议修复

无。

### P2 — 可选优化

| # | 视角 | 文件:行 | 问题 |
|---|------|---------|------|
| 1 | 性能/运维 | `plugins/codex-hud/src/core/store.mjs:29` | 当前 `readEvents` 会读取当前事件文件中的全部内容后再截断到 limit。MVP 数据量可接受，但长期运行需要事件轮转、tail 读取或索引。 |
| 2 | 稳定性 | `plugins/codex-hud/src/daemon/server.mjs:92` | `/stream` 依赖 `fs.watch`，本地开发可用；后续可增加 polling fallback，应对部分文件系统 watch 不稳定。 |

### 测试覆盖评估

| 文件/模块 | 风险 | 应测等级 | 实际覆盖 | 结论 |
|-----------|------|----------|----------|------|
| `src/core/schema.mjs` | L3 | 严格 | phase 归一化、payload 解析、脱敏、fallback session | 充分 |
| `src/core/store.mjs` | L2 | 标准 | JSONL 写入/读取、按 session 文件落盘 | 充分 |
| `src/core/reducer.mjs` | L3 | 严格 | pre/post 配对、乱序事件、耗时计算 | 充分 |
| `src/daemon/server.mjs` | L2 | 标准 | `/health`、`/status` 集成测试 | 充分 |
| `src/terminal/claude-style.mjs` | L2 | 标准 | Claude 风格进度行、运行/失败工具摘要、workspace context 计数 | 充分 |
| `scripts/hook-runner.mjs` | L2 | 标准 | 手动端到端冒烟覆盖 pre/post -> daemon `/status` | 可接受，后续可自动化 |
| `src/ui/*` | L1 | 冒烟 | daemon 启动和 `/health` 验证，静态 UI 由浏览器访问 | 可接受 |
| manifest/hooks/marketplace | L2 | 标准 | `npm run validate` 校验必填字段、路径和 TODO | 充分 |

### 总评

方案 B 的 MVP 已达到可审查状态：hook 采集、事件模型、daemon、Web HUD、diagnostics 和验证脚本分层清晰，符合 sidecar 架构决策。当前没有阻塞进入 Phase 5 Compound 的问题；P2 项可进入后续 backlog。

### 验证证据

- `npm run validate` 通过。
- `npm test` 通过，9/9 tests pass。
- 新增 terminal renderer 与 terminal script 的 `node --check` 通过。
- `npm run hud:once` 成功输出 Claude 风格终端 HUD 快照。
- HUD `/health` 返回 `ok: true`，事件数为 2。

## 复利记录

### 产出

- 解决方案文档：1 个 — `docs/solutions/2026-04-24-codex-hud-sidecar-plugin.md`
- 项目规则：3 个 — `.codex/rules/architecture.md`, `.codex/rules/debugging-gotchas.md`, `.codex/rules/testing-patterns.md`
- 架构决策：1 个 — `rules/architecture.md`
- Skill 信号：9 个 — `skill-signals/*.jsonl`
- 本能：1 个 — `.codex/instincts/terminal-hud-requirement.md`
- Checkpoint：0 次 — Sprint 未触发上下文退化，未创建 checkpoint

### 提取的经验

- Codex HUD 应采用 sidecar 架构，hook 只做采集，daemon/UI 负责状态和展示。
- Claude HUD 类需求的主体验是对话终端，Web sidecar 只能作为诊断面，不能作为默认满足方案。
- hook pre/post 进程不保证共享进程身份；没有 `CODEX_SESSION_ID` 时 fallback 必须按 workspace 稳定聚合。
- 本地观测工具必须默认摘要化和脱敏 tool input/output。
- Codex 插件类项目的测试应覆盖 manifest 校验、事件归一化、reducer、daemon API 和端到端 hook 冒烟。

### 后续 Backlog

- 为 `.hud/events/*.jsonl` 增加轮转、tail 读取或索引。
- 为 `/stream` 增加 polling fallback，降低 `fs.watch` 在特殊文件系统上的不稳定风险。
