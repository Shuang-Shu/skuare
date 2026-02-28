# skr health 构建回退修复计划

> 文档类型：PLAN
> 状态：已完成
> 当前节点状态：结束
> 更新时间：2026-02-28
> 适用范围：project-wide
> 日期分支：feat/2026-02-28
> 功能分支：feat/2026-02-28-skr-health-build-fallback
> Worktree 目录：../wt-2026-02-28-skr-health-build-fallback
> 关联规格文件路径：spec/2026-02-28-05/skr-health-build-fallback.md
> 关联计划文件路径：plan/2026-02-28-05/skr-health-build-fallback.md

## 目标与范围
- 修复根目录 `skr` 在缺少 TypeScript 构建环境时错误阻断 `health` 命令的问题。
- 保留已有的源码变更自动重建逻辑，但为已有 `dist/index.js` 的场景提供受控降级运行能力。
- 同步更新 README 与计划日志，记录行为边界和验证结果。

## 架构与 API 设计
- 包装脚本层：在 [skr](/home/shuangshu/study/code/demos/ts-demo/wt-2026-02-28-skr-health-build-fallback/skr) 内保留 `needs_build` 逻辑，新增一次性构建尝试与失败分类处理；仅当已有 `dist/index.js` 且构建失败原因为本地工具链缺失时才允许继续运行。
- CLI 运行层：仍以 `node skuare-cli/dist/index.js` 作为最终执行入口，不修改 CLI 内部命令注册、配置解析和 HTTP 调用实现。
- 文档层：在 [README.md](/home/shuangshu/study/code/demos/ts-demo/wt-2026-02-28-skr-health-build-fallback/README.md) 与 [skuare-cli/README.md](/home/shuangshu/study/code/demos/ts-demo/wt-2026-02-28-skr-health-build-fallback/skuare-cli/README.md) 补充预构建回退说明，避免用户误判为服务错误。

## 分阶段实施步骤
1. 输入=`skr health` 复现结果与当前包装脚本实现 -> 动作=分析 `skr` 何时触发重建、何时直接运行 `dist`，确认最小修复边界 -> 代码变更位置：`skr`、`skuare-cli/dist/index.js`、`skuare-cli/package.json` -> 输出/完成标记=明确根因与允许回退的前提条件。
2. 输入=已确认的回退策略 -> 动作=在 `skr` 中实现“构建失败但已有 dist 时的受控降级”逻辑，并同步更新 README 中的使用说明 -> 代码变更位置：`skr`、`README.md`、`skuare-cli/README.md` -> 输出/完成标记=`./skr health` 不再因 `tsc: not found` 失败。
3. 输入=修复后的代码与文档 -> 动作=执行 CLI/SVC 全量验证与 `skr health` 回归，按 `AppendOnly` 规则回写计划日志和验收结论 -> 代码变更位置：`skuare-cli`、`skuare-svc`、`plan/2026-02-28-05/skr-health-build-fallback.md` -> 输出/完成标记=测试/构建通过，验收节点记录完整。

## 验收标准与风险
- 验收标准：
  - `./skr health` 在无 `tsc` 环境中进入 CLI 网络检查阶段。
  - `npm run check`、`npm run build`（`skuare-cli`）与 `go test ./...`（`skuare-svc`）通过。
  - 文档与计划日志已同步更新。
- 风险：
  - 预构建回退可能运行旧产物，需要通过明确告警降低误判。
  - Shell 脚本处理构建失败输出时需要避免吞掉真实编译错误。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-02-28`
- 功能分支：`feat/2026-02-28-skr-health-build-fallback`
- Worktree：`../wt-2026-02-28-skr-health-build-fallback`
- 目标合入分支：`feat/2026-02-28`
- 关联 PR：待创建

## 开发中问题与解决
- 现存仓库分支 `feat/2026-02-28` 已占用路径前缀，无法按 AGENTS 约定创建 `feat/2026-02-28/<featName>`；本次沿用仓库现状使用 `feat/2026-02-28-skr-health-build-fallback`，并在计划中显式记录该兼容处理。

## 结束回写
- 核心变更：根目录 `skr` 新增受控构建回退逻辑；当本地缺少 TypeScript 工具链但已有 `skuare-cli/dist/index.js` 时，命令输出 `WARN` 后继续运行现有产物。
- 过程总结：已补齐本次需求的 SPEC/PLAN，完成 README 联动与 CLI/SVC 全量验证；`skr health` 已从“构建阶段失败”修正为“进入真实网络请求阶段”。
- 后续优化：可为 CLI 预构建产物增加版本标识或校验信息，进一步降低源码与 `dist` 不一致时的诊断成本。

## 需求设计
### Log
- [2026-02-28 23:58] 根据用户要求“修复 skr health 报错问题”创建 SPEC/PLAN，范围限定为根目录 `skr` 构建回退逻辑、相关 README 与验证日志。

## 开发 1
### Log
- [2026-02-28 23:59] 复现 `./skr health` 失败，错误为 `tsc: not found`；同时验证 `node skuare-cli/dist/index.js health` 可进入真实 CLI 流程并返回网络错误，确认根因在包装脚本而非 `health` 命令本身。
- [2026-02-28 23:59] 修改根目录 `skr`：保留 `needs_build` 检测，新增构建日志捕获与失败分类；当本地缺少 TypeScript 工具链但已有 `dist/index.js` 时输出 `WARN` 并继续运行，否则透传原始构建失败。
- [2026-02-28 23:59] 同步更新根 README 与 `skuare-cli/README.md`，补充 `skr` 预构建回退行为和“无 dist 时仍需先构建”的边界说明。

## 验收 1
### Log
- [2026-02-28 23:59] 单测通过记录：在当前 worktree 的 `skuare-cli` 执行 `npm install --no-package-lock`、`npm run check`、`npm run build` 均通过；在 `skuare-svc` 执行 `go test ./...` 通过。
- [2026-02-28 23:59] 验收结果记录：执行 `./skr health` 后不再出现 `tsc: not found`，而是进入真实 CLI 请求阶段并返回当前服务未启动时的 `[CLI_NETWORK_ERROR] fetch failed`；用户验收结论待用户确认。

## 开发 2（如需）
### Log
- [2026-02-28 23:59] 预留。

## 验收 2（如需）
### Log
- [2026-02-28 23:59] 预留。

## 结束（仅在用户明确同意后填写）
### Log
- [2026-03-01 00:12] 用户同意结束：“合并回写”。
