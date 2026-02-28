# CLI/SVC 命令与存储 Scope 区分计划

> 文档类型：PLAN
> 状态：已完成
> 当前节点状态：结束
> 更新时间：2026-02-28
> 适用范围：skuare-cli, skuare-svc, docs
> 日期分支：feat/2026-02-28
> 功能分支：feat/2026-02-28-cli-svc-command-storage-scope
> Worktree 目录：../wt-2026-02-28-cli-svc-command-storage-scope
> 关联规格文件路径：spec/2026-02-28-03/cli-svc-command-storage-scope.md
> 关联计划文件路径：plan/2026-02-28-03/cli-svc-command-storage-scope.md

## 目标与范围
- 在 CLI 与 SVC 中明确并实现 command scope 与 storage scope 的默认值、覆盖规则与 local 模式行为。
- 落实“服务端远程仓库 + 客户端本地局部仓库”的职责分离，并保证 LOCAL 模式共享目录时 CLI 侧兼容。
- 保持现有主流程兼容，同时补充可观测性与文档说明。

## 架构与 API 设计
- CLI：
  - 在 `skuare-cli/src/commands/query.ts` 的安装命令中新增/完善 scope 入参解析（默认 `workspace`，支持 `global|workspace` 显式覆盖），并将 scope 解析为目标根目录。
  - 在 `skuare-cli/src/commands/write.ts`、`skuare-cli/src/commands/registry.ts` 将 `create` 命令入口迁移为 `publish`，并保留 `create` 兼容别名（标记弃用）。
  - 在 `skuare-cli/src/config/resolver.ts` 与 `skuare-cli/src/types/index.ts` 中补充 scope 相关配置类型与默认规则，确保“参数 > workspace 配置 > global 配置 > 默认值”一致。
  - 在 `skuare-cli/src/index.ts` 与 `skuare-cli/src/commands/help.ts` 更新命令帮助与示例，明确“客户端本地局部仓库”语义。
  - 在 CLI 安装写入路径上增加 LOCAL 共享目录兼容处理（冲突检查、覆盖策略、提示信息）。
- SVC：
  - 在 `skuare-svc/internal/config/config.go` 明确默认存储根路径为 `~/.skuare` 语义，并梳理 local 模式下与 CLI 本地仓库可共享目录的配置说明。
  - 在 `skuare-svc/internal/store/fs_store.go` / `skuare-svc/internal/store/filesystem.go` 校验路径拼接与目录创建逻辑，确保 system FS 与默认路径策略一致。
- 文档：
  - 更新 `skuare-cli/README.md`、`skuare-svc/README.md` 对 scope、仓库角色边界、`publish` 关键字与默认路径的说明。

## 分阶段实施步骤
1. 输入=现有 CLI 安装命令与配置模型 -> 动作=新增 command scope 参数解析与默认 workspace 规则，完成 target root 解析链路 -> 代码变更位置：`skuare-cli/src/commands/query.ts`、`skuare-cli/src/types/index.ts`、`skuare-cli/src/config/resolver.ts` -> 输出/完成标记=CLI 安装命令支持 `global|workspace` 且默认 workspace。
2. 输入=CLI 写命令与命令注册现状 -> 动作=将 `create` 关键字替换为 `publish`（保留兼容别名），同步更新帮助文案与错误提示 -> 代码变更位置：`skuare-cli/src/commands/write.ts`、`skuare-cli/src/commands/registry.ts`、`skuare-cli/src/index.ts`、`skuare-cli/src/commands/help.ts` -> 输出/完成标记=用户可通过 `publish` 执行发布，`create` 兼容可用并提示迁移。
3. 输入=现有 SVC 配置与存储初始化流程 -> 动作=统一默认存储根路径语义为 `~/.skuare`，明确 local 模式共享路径行为并补齐配置注释/说明 -> 代码变更位置：`skuare-svc/internal/config/config.go`、`skuare-svc/internal/store/fs_store.go`、`skuare-svc/internal/store/filesystem.go` -> 输出/完成标记=SVC 默认 system FS + `~/.skuare` 行为稳定可验证。
4. 输入=LOCAL 模式下 CLI/SVC 可能共享目录 -> 动作=在 CLI 写入层补充共享目录兼容策略（冲突探测、覆盖策略、幂等处理）并增加测试覆盖 -> 代码变更位置：`skuare-cli/src/commands/query.ts`、`skuare-cli/src/utils/fs.ts`、相关测试文件 -> 输出/完成标记=共享目录场景下行为可预测且有测试保护。
5. 输入=实现改动 -> 动作=补充/更新单测覆盖默认值与参数覆盖关系，执行全量回归与构建 -> 代码变更位置：`skuare-cli`、`skuare-svc` 测试与构建脚本 -> 输出/完成标记=历史单测全量通过，构建通过。
6. 输入=代码与测试结果 -> 动作=同步更新文档并记录验收日志（单测记录+用户验收结论） -> 代码变更位置：`skuare-cli/README.md`、`skuare-svc/README.md`、`plan/2026-02-28-03/cli-svc-command-storage-scope.md` -> 输出/完成标记=文档一致且计划日志闭环。

## 验收标准与风险
- 验收标准：
  - CLI 安装命令默认 `workspace`，支持参数化切换到 `global`。
  - CLI 发布关键字切换为 `publish`，`create` 仍可兼容调用并给出迁移提示。
  - CLI/SVC 默认本地存储路径均为 `~/.skuare`，local 模式共享路径行为明确并可实测。
  - LOCAL 共享目录下 CLI 兼容策略生效，不出现非预期覆盖或异常失败。
  - CLI 与 SVC 历史测试集全量通过；构建通过。
  - 每轮验收日志包含“单测通过记录”与“用户验收结论”。
- 风险：
  - scope 切换可能引入路径兼容问题；需要覆盖 `~` 展开、相对路径、跨平台路径。
  - local 模式共享目录存在并发写风险；需明确冲突策略与提示。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-02-28`
- 功能分支：`feat/2026-02-28-cli-svc-command-storage-scope`
- Worktree：`../wt-2026-02-28-cli-svc-command-storage-scope`
- 目标合入分支：`feat/2026-02-28`
- 关联 PR：待创建

## 开发中问题与解决
- Git 命名约束：仓库已存在 `feat/2026-02-28` 分支，Git 不允许再创建 `feat/2026-02-28/...` 层级分支。
- 解决方案：功能分支实际落地为 `feat/2026-02-28-cli-svc-command-storage-scope`，同时保持计划文档中的日期分支与功能语义映射不变。

## 结束回写
- 核心变更：CLI 将 `publish` 设为主写命令，`get` 新增 `--scope/--repo-dir/--tool` 并写入本地局部仓库 `repos/<scope>/<tool>/...`；SVC 默认远程仓库根统一为 `~/.skuare`，并补充 LOCAL 共享目录兼容说明。
- 过程总结：已完成 CLI/SVC 代码实现、README/技术综述/Makefile 联动、SVC 默认路径测试补充，以及全量 `go test ./...`、`npm run check`、`npm run build` 验证。
- 后续优化：可为 `get/publish` 增加更细粒度的自动化测试，覆盖 `--scope`、`--repo-dir`、共享目录冲突提示与 `create` 弃用输出。

## 需求设计
### Log
- [2026-02-28 00:25] 根据用户新增需求“区分 cli/svc 的命令 scope 与存储 scope”创建 SPEC/PLAN，明确默认路径、scope 选项与参数覆盖方向。
- [2026-02-28 00:31] 根据用户澄清回写：将术语明确为“服务端远程仓库 + 客户端本地局部仓库”，命令关键字由 `create` 迁移到 `publish`，并补充 LOCAL 同目录复用时的 CLI 兼容要求。

## 开发 1
### Log
- [2026-02-28 00:25] 预留。
- [2026-02-28 01:43] 建立隔离开发目录 `../wt-2026-02-28-cli-svc-command-storage-scope`，切换到功能分支 `feat/2026-02-28-cli-svc-command-storage-scope` 开发。
- [2026-02-28 22:54] 完成 CLI 安装链路改造：`get` 新增 `--scope global|workspace`、`--repo-dir`、`--tool`，默认写入本地局部仓库 `repos/<scope>/<tool>/...`。
- [2026-02-28 22:54] 完成命令迁移：新增 `publish` 主命令，`create` 保留为兼容别名并输出弃用提示；同步更新命令注册和帮助文案。
- [2026-02-28 22:54] 完成 LOCAL 共享目录兼容：当 CLI 仓库根与服务端 `remote.storageDir` 相同且处于 local 模式时，CLI 检测并记录覆盖冲突，保持安装行为幂等。
- [2026-02-28 22:54] 完成 SVC 默认存储根调整：`--spec-dir` 默认值改为 `~/.skuare`，并补充 `internal/config/config_test.go` 验证默认路径与授权文件路径。
- [2026-02-28 22:54] 完成 README 联动更新：明确“远程仓库 vs 本地局部仓库”角色、`publish` 关键字与 LOCAL 共享目录行为。

## 验收 1
### Log
- [2026-02-28 00:25] 预留（需在实现后补充：单测通过记录 + 用户验收结论）。
- [2026-02-28 22:54] 单测通过记录：`cd skuare-svc && GOCACHE=/tmp/go-cache-skuare go test ./...` 全量通过；`cd skuare-cli && npm install` 完成依赖安装；`cd skuare-cli && npm run check` 通过；`cd skuare-cli && npm run build` 通过。
- [2026-02-28 22:54] 用户验收结论：开发实现已完成，待用户确认“publish 命令、本地局部仓库 scope、LOCAL 同目录兼容”是否满足预期。

## 开发 2（如需）
### Log
- [2026-02-28 00:25] 预留。
- [2026-03-01 00:14] 补齐仓库主入口联动：更新根 README、`docs/tech_summary.md` 与 `Makefile`，统一 `publish` 主命令、`~/.skuare` 默认仓库根以及 `get --scope` 文案，消除主入口仍指向旧 `create`/`~/.skuare/skills` 的残留。

## 验收 2（如需）
### Log
- [2026-02-28 00:25] 预留。
- [2026-03-01 00:15] 单测通过记录：补齐主入口与文档联动后重新执行 `cd skuare-svc && go test ./...`、`cd skuare-cli && npm run check`、`cd skuare-cli && npm run build`，均通过。
- [2026-03-01 00:15] 用户验收结论：代码、README、技术综述与 Makefile 已对齐到“remote registry + local partial repository / publish / scope 仓库根”语义，待用户确认是否进入结束节点。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-01 00:24] 用户同意结束：“1”。
