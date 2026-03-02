# 项目整体优化机会计划

> 文档类型：PLAN
> 状态：已完成
> 当前节点状态：结束
> 更新时间：2026-03-02
> 适用范围：project-wide
> 日期分支：feat/2026-03-02
> 功能分支：feat/2026-03-02-project-optimization-spec
> Worktree 目录：/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-project-optimization-spec
> 关联规格文件路径：spec/2026-03-02-01/project-optimization-opportunities.md
> 关联计划文件路径：plan/2026-03-02-01/project-optimization-opportunities.md

## 目标与范围
- 读取当前仓库的 CLI、SVC、README、Makefile、既有 spec/plan 与测试分布，形成一份项目级优化规格。
- 输出的优化结论需要覆盖代码风格、功能体验、扩展性、测试质量和工程流程。
- 本轮仅补全文档，不直接改动业务逻辑。

## 架构与 API 设计
- 分析输入层：阅读 `README.md`、`skuare-cli/README.md`、`skuare-svc/README.md`、`Makefile`、现有 `spec/*` 与 `plan/*`，定位文档与脚本层的语义漂移。
- CLI 代码层：重点阅读 `skuare-cli/src/index.ts`、`skuare-cli/src/commands/*.ts`、`skuare-cli/src/config/*.ts`、`skuare-cli/src/http/client.ts`、`skuare-cli/src/domain/errors.ts`，识别命令组织、参数解析、输出格式和测试覆盖问题。
- SVC 代码层：重点阅读 `skuare-svc/internal/http/handler.go`、`skuare-svc/internal/service/skill_service.go`、`skuare-svc/internal/store/fs_store.go`，识别服务分层、索引/查询路径与扩展性问题。
- 文档输出层：把分析结果写入 `spec/2026-03-02-01/project-optimization-opportunities.md`，并在本计划中记录分析依据、验证结果与待后续拆分方向。

## 分阶段实施步骤
1. 输入=仓库目录、既有 spec/plan、README、Makefile -> 动作=确认本轮需求的文档流程约束、分支/worktree 约束与现有语义背景，识别项目级分析范围 -> 代码变更位置=`spec/*`、`plan/*`、`README.md`、`skuare-cli/README.md`、`skuare-svc/README.md`、`Makefile` -> 输出/完成标记=分析边界明确，可进入源码级梳理。
2. 输入=CLI/SVC 源码与测试分布 -> 动作=梳理命令实现集中度、重复逻辑、帮助文本维护方式、服务/存储分层、索引与查询路径、自动化测试覆盖情况，整理为带优先级的优化机会 -> 代码变更位置=`skuare-cli/src/index.ts`、`skuare-cli/src/commands/query.ts`、`skuare-cli/src/commands/write.ts`、`skuare-cli/src/commands/init.ts`、`skuare-cli/src/config/*`、`skuare-cli/src/http/client.ts`、`skuare-svc/internal/http/handler.go`、`skuare-svc/internal/service/skill_service.go`、`skuare-svc/internal/store/fs_store.go` -> 输出/完成标记=形成结构化问题清单。
3. 输入=结构化问题清单 -> 动作=编写项目级 SPEC，按代码风格、功能体验、扩展性、测试与文档流程等维度沉淀需求范围、非目标、验收标准和优化建议 -> 代码变更位置=`spec/2026-03-02-01/project-optimization-opportunities.md` -> 输出/完成标记=spec 可作为后续专项需求的上游输入。
4. 输入=新增 spec 与本轮分析记录 -> 动作=补写计划文档、记录分支/worktree 映射、开发日志与验收日志，并执行全量测试与构建验证 -> 代码变更位置=`plan/2026-03-02-01/project-optimization-opportunities.md`、`skuare-cli`、`skuare-svc` -> 输出/完成标记=计划日志完整，测试与构建结果可追踪。

## 验收标准与风险
- 验收标准：
  - 新增项目级优化 spec，内容覆盖代码风格、功能、扩展性、测试、文档流程。
  - 新增对应 plan，并记录分析依据、开发日志、单测/构建验证结果与用户验收待确认状态。
  - `skuare-cli` 与 `skuare-svc` 全量测试、检查、构建命令通过。
- 风险：
  - 仅做文档梳理，不直接修复实现问题，后续仍需拆分专项任务。
  - 若优化点描述不够聚焦，后续拆分时仍可能需要二次分析。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-03-02`
- 功能分支：`feat/2026-03-02-project-optimization-spec`
- Worktree：`/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-project-optimization-spec`
- 目标合入分支：`feat/2026-03-02`
- 关联 PR：待创建

## 开发中问题与解决
- 仓库历史上已把 `feat/<date>` 用作叶子分支，继续创建 `feat/<date>/<featName>` 会与现状冲突；本轮沿用兼容命名 `feat/2026-03-02-project-optimization-spec`。
- 本轮需求要求“补充在 spec 目录下”，但仓库流程强制要求 `spec -> plan -> develop` 闭环；因此同步补充 plan 文档和日志，避免只写 spec 破坏流程约束。
- 验证阶段发现独立 worktree 中缺少 `skuare-cli/node_modules`，导致 `npm run check` 无法直接找到 `tsc`；本轮通过临时链接主工作目录现有依赖完成只读复用，验证结束后已清理该临时链接。

## 结束回写
- 核心变更：新增项目级优化机会 spec/plan，系统梳理了 CLI、SVC、测试、文档和工程流程中的优化方向，并按 P0/P1/P2 做优先级分层。
- 过程总结：先在独立 worktree 中完成仓库级分析，再补全文档闭环，最后执行 CLI/SVC 全量测试与构建验证，确保本轮仅文档变更不影响现有能力。
- 后续优化：建议优先拆分“CLI 命令层解耦”“CLI 测试补齐”“文档与帮助一致性校验”三个专项需求继续推进。

## 需求设计
### Log
- [2026-03-02 23:22] 根据用户要求“仔细分析当前项目，给出可优化点，并补充在 spec 目录下，涵盖代码风格、功能、拓展性等等各个方面”确认本轮以项目级优化规格沉淀为目标。
- [2026-03-02 23:22] 读取仓库结构、既有 spec/plan、README 与模块目录，确认需要同时覆盖 `skuare-cli`、`skuare-svc`、根脚本和工程文档。

## 开发 1
### Log
- [2026-03-02 23:22] 在独立 worktree `/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-project-optimization-spec` 上创建功能分支 `feat/2026-03-02-project-optimization-spec`。
- [2026-03-02 23:22] 完成源码级梳理：识别 `skuare-cli/src/commands/query.ts`、`skuare-cli/src/commands/write.ts` 体量过大，存在参数解析、文件操作、输出组装与网络访问耦合问题。
- [2026-03-02 23:22] 识别文档漂移风险：`README.md`、`skuare-cli/README.md`、`Makefile` 帮助、CLI `printHelp()` 需要长期一致性治理。
- [2026-03-02 23:22] 识别扩展性问题：`skuare-svc/internal/service/skill_service.go` 过薄，`skuare-svc/internal/store/fs_store.go` 中 `GetSkill/GetVersion` 依赖全量索引扫描，CLI 自动化测试覆盖集中在 `build`。
- [2026-03-02 23:22] 新增 `spec/2026-03-02-01/project-optimization-opportunities.md`，将优化机会按 P0/P1/P2 和多个维度沉淀为项目级规格。
- [2026-03-02 23:22] 新增 `plan/2026-03-02-01/project-optimization-opportunities.md`，记录本轮分析路径、分支/worktree 映射与后续验收要求。

## 验收 1
### Log
- [2026-03-02 23:22] 待执行：补充单测通过记录与用户验收结论。
- [2026-03-02 23:41] 单测通过记录：`cd skuare-svc && GOCACHE=/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-project-optimization-spec/.tmp/go-cache go test ./...` 通过；`cd skuare-svc && GOCACHE=/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-project-optimization-spec/.tmp/go-cache go build ./...` 通过；`cd skuare-cli && npm run check` 通过；`cd skuare-cli && npm run build` 通过；`cd skuare-cli && npm test` 通过。
- [2026-03-02 23:41] 用户验收结论：已完成项目级优化机会分析并补充 spec/plan，待用户确认该份规格是否满足后续拆分需求。

## 开发 2（如需）
### Log
- [2026-03-02 23:22] 预留。

## 验收 2（如需）
### Log
- [2026-03-02 23:22] 预留。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-02 23:41] 用户同意结束：“先把这个worktree合入进来吧”。
