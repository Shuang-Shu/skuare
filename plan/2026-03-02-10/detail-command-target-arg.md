# detail 命令按 skillName 或 skillID 定位计划

> 文档类型：PLAN
> 状态：已完成
> 当前节点状态：结束
> 更新时间：2026-03-02
> 适用范围：skuare-cli, docs
> 日期分支：feat/2026-03-02
> 功能分支：feat/2026-03-02-detail-command-target
> Worktree 目录：/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-detail-command-target
> 关联规格文件路径：spec/2026-03-02-10/detail-command-target-arg.md
> 关联计划文件路径：plan/2026-03-02-10/detail-command-target-arg.md

## 目标与范围
- 修正 `skr detail` 的参数语义为 `skr detail [skillName|skillID] [relativePath...]`。
- 让 `detail` 基于本地 skills 根目录定位目标 skill，而不是直接把 `cwd` 当作 skill 根目录。
- 补齐 help、README、测试与日志回写。

## 架构与 API 设计
- skill 根目录解析：复用 `resolveToolSkillsDir(cwd, tool, configuredDir)`，以 `llmTools` 首工具确定本地 skills 根目录。
- skill 目标解析：优先按 `skillID` 精确匹配 `<skillsRoot>/<skillRef>`；若未命中，则扫描 `skillsRoot` 下目录并按 basename 做唯一 `skillName` 匹配。
- 文件读取：将第二个及后续参数视为目标 skill 内相对路径；若未传则默认 `SKILL.md`；保留绝对路径和越界路径拒绝。
- 测试与文档：改写 `skuare-cli/src/detail.test.ts`，覆盖 `skillName`、`skillID`、歧义错误与默认 `SKILL.md`；同步更新 help、README 与计划日志。

## 分阶段实施步骤
1. 输入=`detail` 当前实现与 `resolveToolSkillsDir` 规则 -> 动作=明确目标 skill 根目录、`skillName`/`skillID` 解析顺序、歧义报错文案，并回写计划日志 -> 代码变更位置=`skuare-cli/src/commands/query.ts`、`skuare-cli/src/config/resolver.ts`、`plan/2026-03-02-10/detail-command-target-arg.md` -> 输出/完成标记=`detail` 的新参数语义和本地定位规则明确。
2. 输入=新的解析规则 -> 动作=重构 `DetailCommand`，实现 skills 根目录定位、skillID 精确匹配、basename 唯一匹配、默认 `SKILL.md` 与越界校验 -> 代码变更位置=`skuare-cli/src/commands/query.ts` -> 输出/完成标记=`skr detail <skillRef> [relativePath...]` 可稳定读取目标 skill 文件。
3. 输入=修正后的命令行为 -> 动作=更新 help 与 README 文案，重写/补充自动化测试覆盖默认行为、多文件、skillID、skillName 歧义和非法路径 -> 代码变更位置=`skuare-cli/src/commands/catalog.ts`、`skuare-cli/src/commands/help_text.ts`、`skuare-cli/src/detail.test.ts`、`README.md`、`README_zh.md`、`skuare-cli/README.md`、`skuare-cli/README_zh.md` -> 输出/完成标记=测试与文档和实现一致。
4. 输入=完整变更集 -> 动作=执行 `npm run check`、`npm run build`、`npm test`、`go test ./...`，并用真实 `skr detail <skillRef>` 做一次样例验证，将结果写入验收日志 -> 代码变更位置=`skuare-cli`、`skuare-svc`、`plan/2026-03-02-10/detail-command-target-arg.md` -> 输出/完成标记=进入验收节点。

## 验收标准与风险
- `skr detail <skillRef>` 默认输出目标 skill 的 `SKILL.md`。
- `skr detail <skillRef> <path...>` 只读取目标 skill 目录内文件。
- `skillName` 唯一匹配成功，0 个或多个匹配会报错。
- `npm run check`、`npm run build`、`npm test`、`go test ./...` 全部通过。
- 风险 1：basename 匹配策略与用户期望不一致；缓解=文档明确“skillID 精确优先，skillName 仅做唯一 basename 匹配”。
- 风险 2：多工具场景可能读错目录；缓解=延续现有“取 `llmTools` 首工具”的仓库规则，并在错误信息中包含解析根目录。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-03-02`
- 功能分支：`feat/2026-03-02-detail-command-target`
- Worktree：`/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-detail-command-target`
- 目标合入分支：`feat/2026-03-02`
- 关联 PR：待创建

## 开发中问题与解决
- 仓库当前存在叶子分支 `feat/2026-03-02`，无法继续创建 `feat/2026-03-02/...` 子分支；本需求沿用兼容命名方式，使用 `feat/2026-03-02-detail-command-target`。
- 现有 `detail` 已合入 `master`，但参数语义与用户要求不一致，本次作为修正需求处理。

## 结束回写
- 已将 `skr detail` 修正为 `skr detail <skillName|skillID> [relativePath...]`，先定位本地已安装 skill，再读取目标文件。
- 命令实现复用了现有本地 skills 根目录规则，支持 `skillID` 精确匹配与 `skillName` 唯一 basename 匹配，并保留越界路径拒绝。
- help、README、中英文 CLI 文档、自动化测试与 SPEC/PLAN 日志均已同步更新，并完成全量校验与真实命令验证。

## 需求设计
### Log
- [2026-03-02 08:56] 根据用户反馈“命令应该是 `skr detail [skillName|skillID] [relativePath...]`”创建修正 SPEC/PLAN，范围限定为 `detail` 命令参数语义、本地 skill 定位规则、测试与文档。
- [2026-03-02 08:56] 设计决定：`detail` 复用 `llmTools` 首工具对应的本地 skills 根目录；优先按 `skillID` 精确匹配，再按 basename 做 `skillName` 唯一匹配；文件路径参数从第二个位置参数开始。

## 开发 1
### Log
- [2026-03-02 08:56] 预留。
- [2026-03-02 09:08] 已将 `detail` 改为 `detail <skillName|skillID> [relativePath...]`：首参数先解析目标 skill，本地 skills 根目录复用 `llmTools` 首工具与 `toolSkillDirs` 规则。
- [2026-03-02 09:08] 已实现 `skillID` 精确匹配和 `skillName` basename 唯一匹配；同名多 skill 时返回歧义错误，未命中时返回根目录+skillRef 错误。
- [2026-03-02 09:08] 已同步改写 `skuare-cli/src/detail.test.ts`、help、README 中对 `detail` 的参数说明与示例，移除旧的“当前目录即 skill 根目录”语义。

## 验收 1
### Log
- [2026-03-02 08:56] 预留。
- [2026-03-02 09:08] 单测通过记录：在 `skuare-cli` 目录执行 `npm install --ignore-scripts --no-package-lock`、`npm run check`、`npm run build`、`npm test` 全部通过；在 `skuare-svc` 目录执行 `go test ./...` 全量通过。
- [2026-03-02 09:08] 验收结果记录：在临时 workspace 下创建 `skills/skuare/demo`，执行 `skr detail demo` 默认输出目标 skill 的 `SKILL.md`；执行 `skr detail skuare/demo references/details.md` 正确输出指定文件内容。
- [2026-03-02 09:08] 用户验收结论：待确认。

## 开发 2（如需）
### Log
- [2026-03-02 08:56] 预留。

## 验收 2（如需）
### Log
- [2026-03-02 08:56] 预留。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-02 09:05] 用户同意结束："如果你完成开发，就结束"
- [2026-03-02 09:05] 结束回写：`skr detail` 已按用户要求修正为 `detail <skillName|skillID> [relativePath...]`，默认展示目标 skill 的 `SKILL.md`，支持 skillID 精确匹配、skillName 唯一匹配、多文件查看与越界路径校验；文档、测试和验收记录已同步。
