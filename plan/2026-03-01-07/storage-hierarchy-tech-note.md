# 分级存储机制技术说明计划

> 文档类型：PLAN
> 状态：已完成
> 当前节点状态：结束
> 更新时间：2026-03-01
> 适用范围：docs, skuare-cli, skuare-svc
> 日期分支：feat/2026-03-01
> 功能分支：feat/2026-03-01-init-remote-storage-server-owned
> Worktree 目录：../wt-2026-03-01-init-remote-storage-server-owned
> 关联规格文件路径：spec/2026-03-01-07/storage-hierarchy-tech-note.md
> 关联计划文件路径：plan/2026-03-01-07/storage-hierarchy-tech-note.md

## 目标与范围
- 输出一份与当前实现一致的分级存储技术说明文档。
- 将服务端仓库、CLI 配置和 CLI 本地局部仓库三类层级拆开说明，避免混淆。
- 在技术综述中增加引用入口，方便开发者快速定位。

## 架构与 API 设计
- 文档主体：在 `docs/storage_hierarchy.md` 中按“概览 -> 服务端远程仓库 -> CLI 配置分级 -> CLI 本地局部仓库 -> 数据流 -> 边界与常见误区”组织内容。
- 引用入口：在 `docs/tech_summary.md` 的目标与范围或关键配置部分补充对 `docs/storage_hierarchy.md` 的引用。
- 事实依据：以 `skuare-cli/src/config/resolver.ts`、`skuare-cli/src/commands/query.ts`、`skuare-svc/internal/config/config.go`、`skuare-svc/internal/store/fs_store.go` 为主要实现来源。

## 分阶段实施步骤
1. 输入=用户提出“写到 docs 目录下，作为技术说明” -> 动作=梳理当前代码中的配置层级、远程仓库层级和本地局部仓库层级，确认文档边界与文件落点 -> 代码变更位置=`docs/tech_summary.md`、`docs/storage_hierarchy.md`、`skuare-cli/src/config/resolver.ts`、`skuare-cli/src/commands/query.ts`、`skuare-svc/internal/config/config.go`、`skuare-svc/internal/store/fs_store.go` -> 输出/完成标记=形成文档提纲与事实依据。
2. 输入=文档提纲 -> 动作=新增 `docs/storage_hierarchy.md`，写明目录结构、优先级与数据流，并在 `docs/tech_summary.md` 增加引用入口 -> 代码变更位置=`docs/storage_hierarchy.md`、`docs/tech_summary.md` -> 输出/完成标记=docs 下存在可独立阅读的分级存储技术说明。
3. 输入=新增文档 -> 动作=执行 `skuare-cli` 构建检查与 `skuare-svc` 全量测试，确认文档变更未引入其他回归，并将结果回写计划日志 -> 代码变更位置=`skuare-cli/package.json`、`skuare-svc/...`、`plan/2026-03-01-07/storage-hierarchy-tech-note.md` -> 输出/完成标记=进入验收节点并记录单测与用户验收状态。

## 验收标准与风险
- `docs/storage_hierarchy.md` 成功创建，并与当前实现一致。
- `docs/tech_summary.md` 包含对新文档的明确引用。
- 文档明确说明服务端存储目录由服务端启动参数决定。
- `cd skuare-cli && npm run check`、`cd skuare-cli && npm run build`、`cd skuare-svc && go test ./...` 通过。
- 风险 1：文档和代码后续演进可能再次脱节；缓解=在综述中标记实现依据文件。
- 风险 2：读者将“配置层级”与“仓库存储层级”混为一谈；缓解=在文档中分章节拆开，并单独列出常见误区。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-03-01`
- 功能分支：`feat/2026-03-01-init-remote-storage-server-owned`
- Worktree：`../wt-2026-03-01-init-remote-storage-server-owned`
- 目标合入分支：`feat/2026-03-01`
- 关联 PR：待创建

## 开发中问题与解决
- 本轮需求属于文档专题补充，但需要确保与刚收敛后的 `remote.storageDir` 语义保持一致，不能引用旧说明。
- 解决方案：直接以当前 worktree 中已修复后的实现为准撰写文档，并在文档中显式说明旧误区已废弃。

## 结束回写
- 已新增 `docs/storage_hierarchy.md` 作为分级存储专题说明，并在 `docs/tech_summary.md` 中补充入口。
- 文档已与当前实现对齐，明确服务端远程仓库、CLI 配置层级和 CLI 本地局部仓库的边界。
- 已完成 `skuare-cli` 构建检查与 `skuare-svc` 全量测试验证。

## 需求设计
### Log
- [2026-03-01 14:24] 根据用户要求新增 docs 技术说明，范围限定为“分级存储机制”的现状整理与引用入口补充，不改动实际存储实现。

## 开发 1
### Log
- [2026-03-01 14:24] 已确认事实依据文件：服务端根目录与默认值来自 `skuare-svc/internal/config/config.go`，远程仓库目录结构来自 `skuare-svc/internal/store/fs_store.go`，CLI 配置层级与本地仓库层级来自 `skuare-cli/src/config/resolver.ts` 和 `skuare-cli/src/commands/query.ts`。
- [2026-03-01 14:26] 已新增 `docs/storage_hierarchy.md`，按服务端远程仓库、CLI 配置层级、CLI 本地局部仓库、tool 目录层级、数据流、边界误区组织说明；并在 `docs/tech_summary.md` 增加引用入口。

## 验收 1
### Log
- [2026-03-01 14:26] 单测通过记录：`cd skuare-cli && npm run check`、`cd skuare-cli && npm run build` 通过；`cd skuare-svc && go test ./...` 通过。
- [2026-03-01 14:26] 用户验收结论：待确认。当前 `docs/storage_hierarchy.md` 已落盘，且明确说明服务端存储目录只由服务端启动参数决定。

## 开发 2（如需）
### Log
- [2026-03-01 14:24] 预留。

## 验收 2（如需）
### Log
- [2026-03-01 14:24] 预留。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-01 14:28] 用户同意结束并合入分支："合入分支；然后告诉我现在还有那些worktree"
- [2026-03-01 14:28] 结束回写：`docs/storage_hierarchy.md` 已落盘并与现有实现对齐，作为分级存储机制的正式技术说明；`docs/tech_summary.md` 已增加入口。
