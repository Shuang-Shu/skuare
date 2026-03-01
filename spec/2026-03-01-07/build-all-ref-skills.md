# build 全量引用当前目录 skill 规格

> 文档类型：SPEC
> 状态：已完成
> 更新时间：2026-03-01
> 适用范围：skuare-cli, docs
> 关联计划文件路径：plan/2026-03-01-07/build-all-ref-skills.md

## 背景与目标
- 当前 `skr build <skillName> [refSkill...]` 只能通过位置参数显式传入引用 skill。
- 用户要求为 `skr build` 增加 `--all` 参数，其行为是将当前目录下的所有合法 skillDir 都作为引用的 skill。
- 目标是在保持现有依赖文件合并语义不变的前提下，为 `build` 增加批量引用模式，并同步更新帮助和文档说明。

## 需求范围
- `skr build <skillName> --all` 会扫描当前目录下所有包含 `SKILL.md` 的直接子目录，并将其作为引用 skill。
- 目标 skill 自身不能被加入依赖集合；若扫描结果包含目标 skill，需要自动排除。
- `--all` 与显式 `refSkill...` 的组合规则需要明确并保持解析稳定。
- 更新 CLI help、README、示例说明与必要文档。

## 非目标
- 不修改 `skill-deps.json` / `skill-deps.lock.json` 的结构与排序规则。
- 不把扫描范围扩展为递归搜索多层目录。
- 不在本需求中增加远程依赖解析、模糊匹配或交互式选择。

## 用户验收标准与风险
- 验收标准：
  - `skr build <skillName> --all` 能扫描当前目录下所有合法 skillDir，并将其写入依赖文件。
  - 目标 skill 不会被写成自己的依赖。
  - 与显式引用参数的组合行为有清晰约束，帮助文档和 README 已同步。
  - CLI 构建校验通过。
- 风险：
  - 当前目录下若包含大量 skillDir，`--all` 可能引入用户未预期的依赖集合。
  - 若扫描规则与已有位置参数解析交织不清，容易造成目标 skill 与引用 skill 重复或遗漏。

## 需求优化建议
- 建议禁止 `--all` 与显式 `refSkill...` 混用，收益是语义单一、易理解；代价是少量高级用法需要分两次执行；风险是已有脚本若尝试混用会收到新错误，需要适配。
