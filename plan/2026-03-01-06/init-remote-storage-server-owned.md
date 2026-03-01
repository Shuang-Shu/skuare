# `skr init` 不再暴露服务端存储目录计划

> 文档类型：PLAN
> 状态：已完成
> 当前节点状态：结束
> 更新时间：2026-03-01
> 适用范围：skuare-cli, docs
> 日期分支：feat/2026-03-01
> 功能分支：feat/2026-03-01-init-remote-storage-server-owned
> Worktree 目录：../wt-2026-03-01-init-remote-storage-server-owned
> 关联规格文件路径：spec/2026-03-01-06/init-remote-storage-server-owned.md
> 关联计划文件路径：plan/2026-03-01-06/init-remote-storage-server-owned.md

## 目标与范围
- 移除 CLI 对 `remote.storageDir` 的交互式配置与默认写入。
- 保留历史配置兼容读取，但不再把该字段作为当前有效客户端配置输出。
- 去掉基于服务端存储目录的客户端共享目录推断，并同步更新 CLI 文档。

## 架构与 API 设计
- 配置模型：在 `skuare-cli/src/types/index.ts` 中将 `remote.storageDir` 收敛为兼容性可选字段，不再由 `createDefaultConfig()` 生成。
- 初始化流程：在 `skuare-cli/src/commands/init.ts` 与 `skuare-cli/src/ui/selectors.ts` 中移除 `storageDir` 交互项、快照项与写入逻辑；保存时仅写入 `mode/address/port` 与鉴权配置。
- 命令上下文：在 `skuare-cli/src/index.ts`、`skuare-cli/src/commands/types.ts`、`skuare-cli/src/commands/query.ts` 中删除 `remoteStorageDir` 依赖，`get` 命令不再根据客户端配置猜测服务端共享目录。
- 文档：更新 `skuare-cli/README.md` 与 `docs/tech_summary.md`，明确服务端存储目录仅由服务端启动参数决定。

## 分阶段实施步骤
1. 输入=用户指出 `skr init` 中 `remote.storageDir` 语义错误 -> 动作=审查 CLI 初始化、配置合并与 `get` 命令目录推断的调用链，确认需要同步收敛的代码与文档位置 -> 代码变更位置=`skuare-cli/src/commands/init.ts`、`skuare-cli/src/types/index.ts`、`skuare-cli/src/commands/query.ts`、`skuare-cli/README.md`、`docs/tech_summary.md` -> 输出/完成标记=形成“停止暴露/停止默认写入/保留兼容读取”的修复边界。
2. 输入=修复边界 -> 动作=修改类型、默认配置、初始化交互、命令上下文与 `get` 输出，移除 `remote.storageDir` 的客户端侧写入与目录推断，同时更新文档措辞 -> 代码变更位置=`skuare-cli/src/types/index.ts`、`skuare-cli/src/config/merger.ts`、`skuare-cli/src/ui/selectors.ts`、`skuare-cli/src/commands/init.ts`、`skuare-cli/src/index.ts`、`skuare-cli/src/commands/types.ts`、`skuare-cli/src/commands/query.ts`、`skuare-cli/README.md`、`docs/tech_summary.md` -> 输出/完成标记=新配置文件与 CLI 帮助不再暴露 `remote.storageDir`。
3. 输入=修改后的源码与文档 -> 动作=执行 `skuare-cli` 构建检查与 `skuare-svc` 全量单测，确认无类型/回归问题，并将结果回写计划日志 -> 代码变更位置=`skuare-cli/package.json`、`skuare-svc/...`、`plan/2026-03-01-06/init-remote-storage-server-owned.md` -> 输出/完成标记=进入验收节点并记录单测结果与用户验收待确认状态。

## 验收标准与风险
- `skr init` 的交互项与快照输出不再包含 `remote.storageDir`。
- 新配置写盘不再包含 `remote.storageDir`。
- `skuare-cli` 可继续读取旧配置文件并正常构建。
- `cd skuare-cli && npm run check`、`cd skuare-cli && npm run build`、`cd skuare-svc && go test ./...` 通过。
- 风险 1：移除共享目录推断后，个别依赖旧输出字段的自动化脚本可能需要调整；缓解=保留 `shared_local_dir` 字段但固定为 `false`。
- 风险 2：旧文档或示例若遗漏，会继续放大错误认知；缓解=同步更新 CLI README 与技术综述。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-03-01`
- 功能分支：`feat/2026-03-01-init-remote-storage-server-owned`
- Worktree：`../wt-2026-03-01-init-remote-storage-server-owned`
- 目标合入分支：`feat/2026-03-01`
- 关联 PR：待创建
- 说明：仓库当前已存在 `feat/2026-03-01` 日期分支，因此功能分支采用仓库现有可执行命名 `feat/2026-03-01-<featName>`，未使用 AGENTS 示例中的三层 ref 形式。

## 开发中问题与解决
- Git ref 不能在已存在 `feat/2026-03-01` 的前提下继续创建 `feat/2026-03-01/<featName>`。
- 解决方案：沿用仓库已有功能分支命名模式 `feat/2026-03-01-<featName>`，并在本计划中显式记录该偏差。
- 当前 worktree 中 `skuare-cli` 未安装 TypeScript 依赖，首次执行 `npm run check` 报 `tsc: not found`。
- 解决方案：在当前 worktree 的 `skuare-cli` 目录执行 `npm install` 补齐依赖后，再继续 `npm run check` 与 `npm run build`。

## 结束回写
- CLI 已移除 `remote.storageDir` 的初始化展示、默认写入与共享目录推断，服务端存储目录重新收敛为仅由服务端启动参数决定。
- 相关 CLI 文案与技术文档已同步修正，并补充了分级存储专题说明。
- 已完成 `skuare-cli` 构建检查与 `skuare-svc` 全量测试验证。

## 需求设计
### Log
- [2026-03-01 14:12] 根据用户反馈“`remote.storageDir` 只由 server 端启动参数决定”创建 SPEC/PLAN，范围限定为 CLI 配置模型、`skr init` 交互、`get` 目录推断与相关文档。

## 开发 1
### Log
- [2026-03-01 14:12] 已定位客户端误用点：`init` 会展示并保存 `remote.storageDir`，`types/defaults/merger` 将其视为默认客户端配置，`get` 命令还会据此推断 shared local dir。
- [2026-03-01 14:18] 已完成本轮修改：`skr init` 不再展示、编辑或写入 `remote.storageDir`；CLI 默认配置不再生成该字段；`get` 命令停止基于客户端配置推断服务端 shared local dir；CLI README 与技术综述已同步修正语义。

## 验收 1
### Log
- [2026-03-01 14:18] 单测通过记录：`cd skuare-svc && go test ./...` 通过；`cd skuare-cli && npm install` 完成依赖安装；`cd skuare-cli && npm run check`、`cd skuare-cli && npm run build` 通过。
- [2026-03-01 14:18] 用户验收结论：待确认。本轮已完成开发自验，`skr init` 新配置不再暴露 `remote.storageDir`，历史配置中的该字段也不会继续参与当前 CLI 配置合并。

## 开发 2（如需）
### Log
- [2026-03-01 14:12] 预留。

## 验收 2（如需）
### Log
- [2026-03-01 14:12] 预留。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-01 14:28] 用户同意结束并合入分支："合入分支；然后告诉我现在还有那些worktree"
- [2026-03-01 14:28] 结束回写：CLI 不再暴露或写入 `remote.storageDir`，`get` 命令也不再基于客户端配置推断服务端共享目录；相关 README、技术综述与分级存储专题文档已同步更新。
