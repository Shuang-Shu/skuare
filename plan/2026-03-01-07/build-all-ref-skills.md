# build 全量引用当前目录 skill 计划

> 文档类型：PLAN
> 状态：已完成
> 当前节点状态：结束
> 更新时间：2026-03-01
> 适用范围：skuare-cli, docs
> 日期分支：feat/2026-03-01
> 功能分支：feat/2026-03-01-build-all-ref-skills
> Worktree 目录：/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-01-build-all-ref-skills
> 关联规格文件路径：spec/2026-03-01-07/build-all-ref-skills.md
> 关联计划文件路径：plan/2026-03-01-07/build-all-ref-skills.md

## 目标与范围
- 为 `skr build` 增加 `--all` 批量引用模式。
- 扫描当前目录下所有合法 skillDir 作为引用 skill，并自动排除目标 skill 本身。
- 更新帮助和 README，并完成构建验证。

## 架构与 API 设计
- 参数解析层：在 `skuare-cli/src/commands/write.ts` 的 `BuildCommand` 中识别 `--all`，明确与位置参数的组合约束。
- 目录扫描层：复用现有“目录存在且含 `SKILL.md`”判定规则，新增当前目录直接子目录扫描逻辑，产出引用 skill 列表。
- 依赖合并层：保持当前 add 语义与排序规则不变，仅替换 `resolvedRefs` 的来源集合。
- 文档层：更新 `skuare-cli/src/index.ts`、`skuare-cli/src/commands/help.ts`、`README.md`、`skuare-cli/README.md` 对 `build --all` 的说明和示例。

## 分阶段实施步骤
1. 输入=`BuildCommand` 当前参数解析与目录定位实现 -> 动作=梳理 `skillName`、`refSkill...` 与目录扫描边界，确定 `--all` 是否允许和显式引用混用，以及目标 skill 自排除策略 -> 代码变更位置=`skuare-cli/src/commands/write.ts`、`skuare-cli/src/index.ts`、`skuare-cli/src/commands/help.ts` -> 输出/完成标记=形成 `--all` 参数规则与错误提示方案。
2. 输入=`--all` 规则方案 -> 动作=在 `BuildCommand` 中实现当前目录直接子目录扫描、合法 skillDir 过滤、自依赖排除和依赖合并，保持已有显式引用逻辑不回归 -> 代码变更位置=`skuare-cli/src/commands/write.ts` -> 输出/完成标记=`skr build <skillName> --all` 能稳定生成依赖文件。
3. 输入=完成的 CLI 行为 -> 动作=更新根 README、CLI README、help 与示例，明确 `--all` 扫描范围和混用限制，并回写计划日志 -> 代码变更位置=`README.md`、`skuare-cli/README.md`、`skuare-cli/src/index.ts`、`skuare-cli/src/commands/help.ts`、`plan/2026-03-01-07/build-all-ref-skills.md` -> 输出/完成标记=文档与实现一致。
4. 输入=改造后的代码与文档 -> 动作=执行 `npm run check`、`npm run build`，并用实际 `skr build <skillName> --all` 验证依赖生成结果，记录单测/构建与用户验收待确认状态 -> 代码变更位置=`skuare-cli`、`plan/2026-03-01-07/build-all-ref-skills.md` -> 输出/完成标记=进入验收节点。

## 验收标准与风险
- `skr build <skillName> --all` 会将当前目录下所有合法 skillDir 写入依赖文件。
- 目标 skill 不会被写成自身依赖。
- `npm run check`、`npm run build` 通过。
- 风险 1：扫描集合与用户预期不一致；缓解=限定为当前目录直接子目录，并在文档中写明。
- 风险 2：`--all` 与显式位置参数混用后语义不清；缓解=实现中直接禁止混用并给出明确错误。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-03-01`
- 功能分支：`feat/2026-03-01-build-all-ref-skills`
- Worktree：`/home/shuangshu/study/code/demos/ts-demo/wt-2026-03-01-build-all-ref-skills`
- 目标合入分支：`feat/2026-03-01`
- 关联 PR：待创建

## 开发中问题与解决
- 当前 `build` 没有 `--all` 扫描能力，只能通过显式位置参数收集引用 skill。
- 仓库当前日期分支已使用叶子引用 `feat/2026-03-01`，Git 无法继续创建 `feat/2026-03-01/...` 子分支；本需求改用兼容现状的功能分支命名 `feat/2026-03-01-build-all-ref-skills`。
- 最终规则：`--all` 只扫描命令执行目录下的直接子目录，要求目录内存在 `SKILL.md`；目标 skill 自身自动排除；`--all` 与显式 `refSkill...` 不允许混用。

## 结束回写
- `skr build` 已支持 `--all`，会扫描命令执行目录下所有包含 `SKILL.md` 的直接子目录作为引用 skill。
- 扫描结果会自动排除目标 skill 自身，并禁止与显式 `refSkill...` 混用，避免语义冲突。
- help、根 README、CLI README 已同步更新，构建校验与真实命令验证均通过。

## 需求设计
### Log
- [2026-03-01 14:26] 根据用户要求“`skr build 命令添加--all参数，行为是将当前目录下的所有skillDir作为引用的skill`”创建 SPEC/PLAN，范围限定为 CLI build 命令、帮助文档与 README。

## 开发 1
### Log
- [2026-03-01 14:26] 已在 `BuildCommand` 中加入 `--all` 参数解析，并禁止与显式 `refSkill...` 混用，避免批量模式与手工模式语义冲突。
- [2026-03-01 14:26] 已新增当前目录直接子目录扫描逻辑：仅收集包含 `SKILL.md` 的目录作为引用 skill，并自动排除目标 skill 自身。
- [2026-03-01 14:26] 已同步更新 `skuare-cli/src/index.ts`、`skuare-cli/src/commands/help.ts`、`README.md`、`skuare-cli/README.md` 中的 `build --all` 帮助与示例。

## 验收 1
### Log
- [2026-03-01 14:26] 单测通过记录：在 `skuare-cli` 目录执行 `npm install` 后，`npm run check`、`npm run build` 通过。
- [2026-03-01 14:26] 验收结果记录：在 `temp-build-all-test` 中创建 `target-skill`、`ref-a`、`ref-b` 三个最小 skill，执行 `../skr build target-skill --all` 后输出 `added=[ref-a, ref-b]`、`dependency_count=2`，生成的 `skill-deps.json` 仅包含 `ref-a/ref-b`，未包含目标 skill 自身。
- [2026-03-01 14:26] 验收结果记录：执行 `../skr build target-skill ref-a --all` 返回 `--all cannot be used with explicit refSkill arguments`，混用限制生效。
- [2026-03-01 14:26] 用户验收结论：待确认。

## 开发 2（如需）
### Log
- [2026-03-01 14:26] 预留。

## 验收 2（如需）
### Log
- [2026-03-01 14:26] 预留。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-01 14:30] 用户同意结束："好，直接合入主分支"。
- [2026-03-01 14:30] 结束回写：`skr build` 新增 `--all`，可扫描当前目录全部合法 skillDir 并批量写入依赖；目标 skill 自动排除，且 `--all` 与显式 `refSkill...` 不可混用；help、README、CLI README 与验证日志已同步完成。
