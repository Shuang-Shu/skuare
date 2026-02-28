# 仓库代码风格对齐计划

> 文档类型：PLAN
> 状态：已完成
> 当前节点状态：结束
> 更新时间：2026-02-28
> 适用范围：project-wide
> 日期分支：feat/2026-02-28
> 功能分支：feat/2026-02-28-repo-code-style-alignment
> Worktree 目录：../wt-2026-02-28-repo-code-style-alignment
> 关联规格文件路径：spec/2026-02-28-04/repo-code-style-alignment.md
> 关联计划文件路径：plan/2026-02-28-04/repo-code-style-alignment.md

## 目标与范围
- 统一仓库主入口中的命令语义、默认路径和风格表达。
- 修复明显不合理的重复声明、命名漂移和帮助文本过期问题。

## 架构与 API 设计
- 入口脚本层：检查 `Makefile`、`skr`、开发脚本中的默认参数与命令文案，确保与当前 CLI/SVC 语义一致。
- CLI 文档层：检查 `skuare-cli/README.md`、根 `README.md`、帮助输出示例中的命令关键字和默认路径。
- SVC 文档层：检查 `skuare-svc/README.md` 与启动参数说明，确保默认存储根与当前实现一致。

## 分阶段实施步骤
1. 输入=仓库主入口与文档现状 -> 动作=梳理命令命名、默认路径、重复声明等明显不一致点 -> 代码变更位置：`Makefile`、`README.md`、`skuare-cli/README.md`、`skuare-svc/README.md`、相关 CLI 帮助文件 -> 输出/完成标记=形成一组明确的对齐修改点并实施。
2. 输入=已识别的问题点 -> 动作=修复重复 `.PHONY`、过时 `create` 文案、旧默认路径 `~/.skuare/skills` 等问题，保持命令行为与帮助一致 -> 代码变更位置：`Makefile`、`skuare-cli/src/index.ts`、`skuare-cli/src/commands/help.ts`、相关 README -> 输出/完成标记=主入口风格一致。
3. 输入=改动完成 -> 动作=执行 CLI/SVC 全量验证并回写计划日志 -> 代码变更位置：`skuare-cli`、`skuare-svc`、`plan/2026-02-28-04/repo-code-style-alignment.md` -> 输出/完成标记=构建、测试通过且验收日志完整。

## 验收标准与风险
- 验收标准：
  - 主入口命名和默认路径一致。
  - 仓库里最明显的风格问题被清理。
  - `npm run check`、`npm run build`、`go test ./...` 通过。
- 风险：
  - 可能遗漏深层文档中的历史文案。
  - `Makefile` 行为调整需要谨慎避免引入脚本回归。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-02-28`
- 功能分支：`feat/2026-02-28-repo-code-style-alignment`
- Worktree：`../wt-2026-02-28-repo-code-style-alignment`
- 目标合入分支：`feat/2026-02-28`
- 关联 PR：待创建

## 开发中问题与解决
- 当前 worktree 基于较早的 `master` 快照，已落后于主线上的 `publish/scope` 语义与 README 变更。
- 解决方案：本轮不回滚主线已完成能力，仅保留仍有价值的入口风格修正，并将相关文件对齐到当前主线语义。

## 结束回写
- 核心变更：在不回滚主线 `publish/scope` 语义的前提下，清理仓库入口风格问题，重点修正 `make format` 的过时 `VERSION` 依赖、`scripts/dev-up.sh` 默认 `SPEC_DIR`，并同步回写 README/技术综述。
- 过程总结：先识别出该 worktree 落后于主线的风险，再将文件对齐到当前主线语义，仅保留仍有价值的风格修正，最后完成 CLI/SVC 全量验证。
- 后续优化：可继续增加主入口一致性检查，例如对 `Makefile`、README、CLI help 做快照或 lint 校验，避免 stale 分支回滚主线语义。

## 需求设计
### Log
- [2026-02-28 23:35] 根据用户要求“检查整个仓库的代码风格，优化不合理的地方”创建 SPEC/PLAN，范围聚焦于主入口、帮助文档、默认路径和明显的重复/过期风格问题。

## 开发 1
### Log
- [2026-02-28 23:35] 预留。
- [2026-02-28 23:36] 建立隔离开发目录 `../wt-2026-02-28-repo-code-style-alignment`，从 `master` 创建功能分支 `feat/2026-02-28-repo-code-style-alignment`。
- [2026-02-28 23:38] 清理 `Makefile` 入口风格：移除重复 `.PHONY`，修正 `format` 目标的过时 `VERSION` 参数依赖，并补充更准确的帮助说明。
- [2026-02-28 23:38] 统一 dev 脚本默认值：`scripts/dev-up.sh` 的 `SPEC_DIR` 默认值改为 `$HOME/.skuare/skills`，与 `Makefile` 和 SVC README 保持一致。
- [2026-02-28 23:38] 对齐仓库文档与帮助文案：更新根 README、技术综述、SVC README 及 CLI `get` 描述，使其更贴近当前 `master` 的实际行为。

## 验收 1
### Log
- [2026-02-28 23:35] 预留（需在实现后补充：单测通过记录 + 用户验收结论）。
- [2026-02-28 23:38] 单测通过记录：`cd skuare-svc && GOCACHE=/tmp/go-cache-skuare go test ./...` 全量通过；`cd skuare-cli && npm install` 完成依赖安装；`cd skuare-cli && npm run check` 通过；`cd skuare-cli && npm run build` 通过。
- [2026-02-28 23:38] 用户验收结论：本轮仓库级风格对齐已完成，待用户确认这些入口层优化是否符合预期。

## 开发 2（如需）
### Log
- [2026-02-28 23:35] 预留。
- [2026-03-01 00:31] 识别到当前功能分支已落后于主线：若直接合并会回滚 `publish`、`scope` 与 `~/.skuare` 仓库根语义，因此将修复范围收敛为仍未落地的入口风格问题。
- [2026-03-01 00:31] 保留并补齐有效改动：`Makefile` 的 `format` 目标移除过时 `VERSION` 依赖并修正帮助文案；`scripts/dev-up.sh` 默认 `SPEC_DIR` 对齐为 `~/.skuare`；技术综述与 README 追加说明。

## 验收 2（如需）
### Log
- [2026-02-28 23:35] 预留。
- [2026-03-01 00:34] 单测通过记录：在对齐 stale worktree 到当前主线语义后，重新执行 `cd skuare-svc && go test ./...`、`cd skuare-cli && npm run check`、`cd skuare-cli && npm run build`，均通过。
- [2026-03-01 00:34] 用户验收结论：当前已仅保留入口风格修正本身，不再回滚主线已完成的 `publish/scope` 能力；待用户确认是否进入结束节点。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-01 00:50] 用户同意结束：“不错，合并吧，并结束需求”。
