# detail 命令展示本地 skill 文件计划

> 文档类型：PLAN
> 状态：已完成
> 当前节点状态：结束
> 更新时间：2026-03-02
> 适用范围：skuare-cli, docs
> 日期分支：feat/2026-03-02
> 功能分支：feat/2026-03-02-detail-command
> Worktree 目录：/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-detail-command
> 关联规格文件路径：spec/2026-03-02-09/detail-command.md
> 关联计划文件路径：plan/2026-03-02-09/detail-command.md

## 目标与范围
- 为 CLI 增加 `skr detail [skillRelativePath...]` 本地文件查看命令。
- 默认在未传参时展示当前目录下 `SKILL.md`，传参时读取对应相对路径文件。
- 补充帮助、README 与自动化测试，并完成 CLI 全量校验。

## 架构与 API 设计
- 命令入口：在 `skuare-cli/src/commands/query.ts` 中新增 `DetailCommand`，沿用现有读操作命令分组；在 `skuare-cli/src/commands/catalog.ts` 注册命令与 help 文案。
- 路径解析：以 `context.cwd` 作为 skill 根目录，解析 `skillRelativePath`；默认目标为 `SKILL.md`；拒绝绝对路径和解析后落到根目录外的相对路径。
- 输出策略：单文件直接输出内容；多文件按统一文件头分隔输出，避免内容混淆。
- 测试与文档：在 `skuare-cli/src/detail.test.ts` 新增本地命令测试，更新 `README.md`、`README_zh.md`、`skuare-cli/README.md`、`skuare-cli/README_zh.md` 的命令说明与示例。

## 分阶段实施步骤
1. 输入=`query.ts` 与 `catalog.ts` 现有读命令结构 -> 动作=确定 `detail` 的参数解析、路径约束、单文件/多文件输出规范与错误提示，并把方案回写到计划日志 -> 代码变更位置=`skuare-cli/src/commands/query.ts`、`skuare-cli/src/commands/catalog.ts`、`plan/2026-03-02-09/detail-command.md` -> 输出/完成标记=`detail` 命令接口和边界规则明确。
2. 输入=`detail` 命令规则 -> 动作=在 `DetailCommand` 中实现默认 `SKILL.md`、相对路径校验、UTF-8 文件读取与多文件分隔输出，并注册到命令表 -> 代码变更位置=`skuare-cli/src/commands/query.ts`、`skuare-cli/src/commands/catalog.ts` -> 输出/完成标记=`skr detail` 可在本地稳定读取目标文件。
3. 输入=实现后的命令行为 -> 动作=补充 `detail` 命令测试，覆盖默认行为、多文件输出和非法路径报错；同步更新中英文 README 与 help 文案 -> 代码变更位置=`skuare-cli/src/detail.test.ts`、`README.md`、`README_zh.md`、`skuare-cli/README.md`、`skuare-cli/README_zh.md`、`skuare-cli/src/commands/catalog.ts` -> 输出/完成标记=测试与文档和实现一致。
4. 输入=完整变更集 -> 动作=执行 `npm run check`、`npm run build`、`npm test`，并用真实 `skr detail` 命令做一次工作区样例验证，将单测结果与用户验收待确认状态写入计划日志 -> 代码变更位置=`skuare-cli`、`plan/2026-03-02-09/detail-command.md` -> 输出/完成标记=进入验收节点。

## 验收标准与风险
- `skr detail` 在无参数时输出当前目录 `SKILL.md` 内容。
- `skr detail <path...>` 能读取当前目录内多个相对路径文件，并清晰区分输出。
- 非法路径或缺失文件会返回明确错误，且不会读取到 skill 根目录外文件。
- `npm run check`、`npm run build`、`npm test` 全部通过。
- 风险 1：多文件分隔格式如果定义不稳定，后续文档与测试容易漂移；缓解=在测试中固定文件头格式。
- 风险 2：路径规范化若处理不严谨，可能留下目录穿越漏洞；缓解=统一走 `resolve` + 前缀校验并拒绝绝对路径。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-03-02`
- 功能分支：`feat/2026-03-02-detail-command`
- Worktree：`/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-02-detail-command`
- 目标合入分支：`feat/2026-03-02`
- 关联 PR：待创建

## 开发中问题与解决
- 仓库当前已存在叶子分支 `feat/2026-03-02`，Git 无法继续创建 `feat/2026-03-02/...` 子分支；本需求沿用仓库近期兼容命名方式，使用 `feat/2026-03-02-detail-command`。
- `detail` 属于本地只读能力，但仍需明确定义读取边界，否则容易误读 skill 根目录外文件。

## 结束回写
- 已新增 `skr detail [skillRelativePath...]`，默认输出当前 skill 目录下的 `SKILL.md`，支持按相对路径读取一个或多个本地文件。
- 命令实现补充了绝对路径/越界路径拒绝与多文件头分隔输出，避免误读 skill 根目录外内容。
- `skuare-cli` 与根 README 的命令说明、自动化测试、SPEC/PLAN 日志均已同步更新，并完成全量校验与真实命令验证。

## 需求设计
### Log
- [2026-03-02 08:43] 根据用户需求“添加一个 detail 命令，`skr detail [skillRelativePath...]`，用于展示对应文件内容；当参数为空时，默认展示 `SKILL.md` 的内容”创建 SPEC/PLAN，范围限定为 CLI 本地读命令、帮助文档、README 与自动化测试。
- [2026-03-02 08:43] 设计决定：`detail` 以 `context.cwd` 作为 skill 根目录；空参数默认读 `SKILL.md`；多文件输出使用统一文件头分隔；拒绝绝对路径和越界相对路径。

## 开发 1
### Log
- [2026-03-02 08:43] 预留。
- [2026-03-02 08:56] 已在 `skuare-cli/src/commands/query.ts` 新增 `DetailCommand`，实现默认读取 `SKILL.md`、相对路径校验、越界拒绝与多文件分隔输出。
- [2026-03-02 08:56] 已在 `skuare-cli/src/commands/catalog.ts`、`skuare-cli/src/commands/help_text.ts` 注册 `detail` 命令与示例，并补充 `skuare-cli/src/detail.test.ts` 覆盖默认行为、多文件输出和非法路径错误。
- [2026-03-02 08:56] 已同步更新 `README.md`、`README_zh.md`、`skuare-cli/README.md`、`skuare-cli/README_zh.md` 中对 `detail` 的命令分组、示例和行为说明。

## 验收 1
### Log
- [2026-03-02 08:43] 预留。
- [2026-03-02 09:05] 单测通过记录：在 `skuare-cli` 目录先执行 `npm install --ignore-scripts --no-package-lock` 补齐 TypeScript 依赖，再执行 `npm run check`、`npm run build`、`npm test`，全部通过；在 `skuare-svc` 目录执行 `go test ./...`，全部通过。
- [2026-03-02 09:05] 验收结果记录：在 worktree 临时样例目录执行 `skr detail`，默认输出 `SKILL.md`；执行 `skr detail references/details.md notes.txt` 输出带文件头分隔的两段文件内容，行为符合设计。
- [2026-03-02 09:05] 用户验收结论：待确认。

## 开发 2（如需）
### Log
- [2026-03-02 08:43] 预留。

## 验收 2（如需）
### Log
- [2026-03-02 08:43] 预留。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-02 08:53] 用户同意结束："通过"
- [2026-03-02 08:53] 结束回写：`skr detail [skillRelativePath...]` 已完成交付，默认展示 `SKILL.md`，支持多文件查看并拒绝越界路径；CLI/README/测试与验收日志已同步。
