# detail 命令按 skillName 或 skillID 定位规格

> 文档类型：SPEC
> 状态：已完成
> 更新时间：2026-03-02
> 适用范围：skuare-cli, docs
> 关联计划文件路径：plan/2026-03-02-10/detail-command-target-arg.md

## 背景与目标
- 已上线的 `skr detail` 当前把执行目录 `cwd` 直接当成 skill 根目录处理。
- 用户明确要求命令形态应为 `skr detail [skillName|skillID] [relativePath...]`，即先指定目标 skill，再展示该 skill 目录内文件内容。
- 目标是在沿用本地 skills 目录配置规则的前提下，修正 `detail` 的参数语义，并同时支持 `skillID` 精确定位和 `skillName` 唯一映射。

## 需求范围
- `skr detail <skillName|skillID> [relativePath...]` 中第一个位置参数必须作为目标 skill 标识。
- 当第二段及后续路径参数为空时，默认展示目标 skill 目录下的 `SKILL.md`。
- 当传入的是 `skillID` 时，按本地 skills 根目录下的实际目录精确定位。
- 当传入的是 `skillName` 时，需要在本地 skills 根目录中解析为唯一匹配的 skill；若 0 个或多个匹配，必须报清晰错误。
- 读取文件时仍然只允许访问目标 skill 目录内的相对路径。
- 更新测试、help、README、SPEC/PLAN。

## 非目标
- 不新增远程查询、自动下载或模糊推荐能力。
- 不改变 `skr get` / `skr build` / `skr publish` 的目录与参数语义。
- 不在本需求中实现交互式选择同名 skill。

## 用户验收标准与风险
- 验收标准：
  - `skr detail report-generator` 能在本地 skills 目录中解析到目标 skill，并默认输出其 `SKILL.md`。
  - `skr detail skuare/report-generator references/details.md` 能精确读取该 skill 下指定文件。
  - 同名 `skillName` 对应多个 `skillID` 时会报歧义错误。
  - 缺失 skill、越界路径、绝对路径会给出清晰错误。
- 风险：
  - 本地同名 skill 较多时，`skillName` 解析可能产生歧义。
  - 若 `detail` 没有复用现有工具 skills 目录规则，可能与 `skr get` 安装位置不一致。

## 需求优化建议
- 建议 `detail` 的 skill 根目录解析复用现有 `llmTools` 首工具与 `toolSkillDirs` 配置规则；收益是行为与 `skr get` 一致；代价是多工具场景仍然以首工具为准；风险是用户若误配 `llmTools` 顺序，可能读到非预期目录。
- 建议对 `skillName` 采用“唯一 basename 匹配”策略并在冲突时直接报错；收益是可同时支持 `skillID` 与简写 `skillName`；代价是需要一次目录扫描；风险是当本地 skills 数量较多时会有少量额外 IO。
