# build 缺失 skill 时自动创建模板计划

> 文档类型：PLAN
> 状态：已完成
> 当前节点状态：结束
> 更新时间：2026-03-01
> 适用范围：skuare-cli, docs
> 日期分支：feat/2026-03-01
> 功能分支：feat/2026-03-01-build-create-skill-template
> Worktree 目录：../wt-2026-03-01-build-create-skill-template
> 关联规格文件路径：spec/2026-03-01-05/build-create-skill-template.md
> 关联计划文件路径：plan/2026-03-01-05/build-create-skill-template.md

## 目标与范围
- 让 `skr build` 在目标 skill 缺失时自动初始化基础 skill 目录与 `SKILL.md` 模板。
- 通过交互式输入补齐最小可用元信息，再继续写入依赖文件。
- 保持已有 skill 的依赖追加逻辑不回归，并兼容 `--all` 批量扫描模式，同时同步更新 CLI 文档。

## 架构与 API 设计
- 命令层：在 `skuare-cli/src/commands/write.ts` 的 `BuildCommand` 中区分“目标 skill”与“引用 skill”的解析策略，目标 skill 允许不存在时进入初始化流程；引用 skill 同时兼容显式 `refSkill...` 与 `--all` 批量扫描。
- 交互层：在 `BuildCommand` 内部使用 readline 创建简短问答流程，只采集 `description`、`metadata.author`、`metadata.version` 三个最小必填项；同时提供可覆写的 `createReadlineInterface()` 以支持自动化测试。
- 文件层：初始化时仅创建 `<skillDir>/SKILL.md`，正文写入最小模板；依赖文件仍由现有 `build` 合并逻辑生成。
- 文档层：更新 `README.md`、`skuare-cli/README.md`、help 文案与 CLI 描述，明确 `build` 支持从零创建目标 skill。

## 分阶段实施步骤
1. 输入=`skr build` 当前失败路径与现有 CLI 交互能力 -> 动作=阅读 `BuildCommand`、`prompts` 与帮助文档，确定目标 skill 初始化流程、模板字段集合与测试切入点 -> 代码变更位置=`skuare-cli/src/commands/write.ts`、`skuare-cli/src/index.ts`、`skuare-cli/src/commands/help.ts` -> 输出/完成标记=形成目标 skill 初始化方案与文档同步范围。
2. 输入=初始化流程设计 -> 动作=在 `BuildCommand` 中实现“缺失目标 skill 时创建目录 + 交互采集元信息 + 写入 `SKILL.md` 模板”，并保留显式引用与 `--all` 批量扫描两条依赖合并逻辑 -> 代码变更位置=`skuare-cli/src/commands/write.ts` -> 输出/完成标记=`skr build <missingSkill> <ref...>` 与 `skr build <missingSkill> --all` 都能完成初始化并产出依赖文件。
3. 输入=实现后的 CLI -> 动作=新增 `node:test` 回归用例，覆盖新建 skill 与既有 skill 追加依赖场景，并更新 README/help/示例 -> 代码变更位置=`skuare-cli/src/build.test.ts`、`skuare-cli/package.json`、`README.md`、`skuare-cli/README.md`、`skuare-cli/src/index.ts`、`skuare-cli/src/commands/help.ts` -> 输出/完成标记=文档与验证同步完成。
4. 输入=完成的代码与文档 -> 动作=执行全量可用校验命令并回写计划日志，记录单测/构建结果与用户验收待确认状态 -> 代码变更位置=`skuare-cli`、`plan/2026-03-01-05/build-create-skill-template.md` -> 输出/完成标记=进入验收节点，等待用户确认。

## 验收标准与风险
- 缺失目标 skill 时，`skr build` 可交互创建模板并完成依赖文件生成。
- 引用 skill 缺失时仍保持明确错误，不静默创建依赖项。
- 自动创建后的 `SKILL.md` 包含合法 frontmatter 与 `metadata.version`。
- `npm run check`、`npm run build`、`npm test` 通过。
- 风险 1：交互逻辑与标准输入耦合导致测试困难；缓解=抽出可覆写的 readline 工厂，测试中注入假输入。
- 风险 2：自动创建目录可能覆盖同名非 skill 目录的预期；缓解=仅在目标路径不是文件时初始化，并保留依赖 skill 的严格存在性校验。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-03-01`
- 功能分支：`feat/2026-03-01-build-create-skill-template`
- Worktree：`../wt-2026-03-01-build-create-skill-template`
- 目标合入分支：`feat/2026-03-01`
- 关联 PR：待创建

## 开发中问题与解决
- 当前问题：`BuildCommand.resolveSkillDir()` 要求目标目录必须已存在且含 `SKILL.md`，导致无法从 0 初始化 skill。
- 预期解决：为目标 skill 增加“允许缺失时初始化”的专用分支，同时兼容 `--all` 批量扫描并保持引用 skill 的严格解析。
- [2026-03-01 13:58] 创建功能分支时发现仓库已有 `feat/2026-03-01` 平面分支，Git 无法同时存在 `feat/2026-03-01/...` 子分支；已改为沿用仓库现状的功能分支命名 `feat/2026-03-01-build-create-skill-template`。
- [2026-03-01 14:12] `node:readline/promises` 的 `createInterface` 在 CommonJS 编译结果中无法直接 monkeypatch；已在 `BuildCommand` 中增加可覆写的 `createReadlineInterface()`，由测试子类注入假输入，避免破坏真实交互路径。

## 结束回写
- `skr build <targetSkill> [refSkill...] [--all]` 现已在目标 skill 缺失时支持交互式初始化最小 `SKILL.md` 模板。
- 自动创建逻辑已兼容 `--all`：目标创建后会继续扫描当前目录下其他合法 skillDir 作为引用 skill，并自动排除目标自身。
- 已新增 `node:test` 回归用例，覆盖显式引用、`--all`、非 TTY 明确失败与已有依赖追加场景；文档与 help 已同步更新。

## 需求设计
### Log
- [2026-03-01 13:58] 根据用户反馈“`skr build work-helper ...` 在缺失目标 skill 时直接报错，希望允许从 0 创建并交互引导元信息”创建 SPEC/PLAN，范围限定为 CLI build 命令、交互提示与相关文档。

## 开发 1
### Log
- [2026-03-01 14:02] 已确认 `BuildCommand.resolveSkillDir()` 对目标 skill 与依赖 skill 共用严格校验，导致目标 skill 缺失时无法进入后续依赖构建。
- [2026-03-01 14:08] 已在 `skuare-cli/src/commands/write.ts` 中为目标 skill 增加初始化分支：缺失时会创建目录、交互采集 `description/metadata.author/metadata.version`，并生成最小 `SKILL.md` 模板。
- [2026-03-01 14:10] 已新增 `skuare-cli/src/build.test.ts`，覆盖“缺失目标 skill 初始化”和“已有 skill 追加依赖不回归”两个场景；同时在 `skuare-cli/package.json` 增加 `npm test` 入口。
- [2026-03-01 14:11] 已同步更新 `README.md`、`skuare-cli/README.md`、`skuare-cli/src/index.ts`、`skuare-cli/src/commands/help.ts`，统一说明 `build` 可交互初始化目标 skill。
- [2026-03-01 14:36] 已将自动创建目标 skill 的实现补到 `master` 的 `build --all` 基线上：目标缺失时，`skr build <missingSkill> --all` 会先创建目标 skill，再扫描当前目录直接子目录里的合法 skillDir 作为引用 skill。
- [2026-03-01 14:36] 已为非 TTY 场景增加明确失败提示，避免在脚本环境中进入不可完成的交互流程。

## 验收 1
### Log
- [2026-03-01 14:14] 单测通过记录：在 `skuare-cli` 目录执行 `npm install --no-package-lock` 安装现有依赖后，`npm run check`、`npm run build`、`npm test` 全部通过。
- [2026-03-01 14:36] 验收范围扩展：新增“缺失目标 skill + --all”与“非 TTY 明确失败”两条回归用例，待本轮重新执行 `npm run check`、`npm run build`、`npm test` 后回写结果。
- [2026-03-01 14:14] 用户验收结论：已按自动化用例验证“缺失目标 skill 时创建 `SKILL.md` 与依赖文件”和“已有 skill 追加依赖不回归”；用户侧手工验收待确认。
- [2026-03-01 14:36] 单测通过记录：在补齐 `--all` 与非 TTY 场景后重新执行 `npm run check`、`npm run build`、`npm test`，共 4 条 `node:test` 用例全部通过。
- [2026-03-01 14:36] 验收结果记录：在私有目录 `temp-build-init-all` 中创建 `ref-a/ref-b` 后，真实执行 `../skr build sci-skills --all`，CLI 先交互创建 `sci-skills/SKILL.md`，随后生成仅包含 `ref-a/ref-b` 的 `skill-deps.json` 与 `skill-deps.lock.json`。

## 开发 2（如需）
### Log
- [2026-03-01 14:14] 预留。

## 验收 2（如需）
### Log
- [2026-03-01 14:14] 预留。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-01 14:39] 用户同意结束："执行合并"。
- [2026-03-01 14:39] 结束回写：`build` 已支持在目标 skill 缺失时交互式创建最小 `SKILL.md` 模板，并兼容 `--all` 批量扫描当前目录 skillDir；`npm run check`、`npm run build`、`npm test` 与真实 `skr build sci-skills --all` 验证已通过。
