# build 缺失 skill 时自动创建模板规格

> 文档类型：SPEC
> 状态：已完成
> 更新时间：2026-03-01
> 适用范围：skuare-cli, docs
> 关联计划文件路径：plan/2026-03-01-05/build-create-skill-template.md

## 背景与目标
- 当前执行 `skr build work-helper github-deep-research web-design-guidelines consulting-analysis deep-research frontend-design ppt-generation` 或 `skr build sci-skills --all` 时，如果目标 skill 目录不存在或缺少 `SKILL.md`，CLI 会直接报错 `Skill directory not found or missing SKILL.md`。
- 用户的新需求是允许从 0 创建目标 skill：当目标 skill 不存在时，CLI 自动创建 `work-helper` 模板，并通过交互式方式引导填写 skill 元信息。
- 目标是让 `skr build <skillName> [refSkill...] [--all]` 兼具“初始化目标 skill”与“写入依赖文件”两类能力，同时保持已有依赖解析行为稳定。

## 需求范围
- `skr build <skillName> [refSkill...] [--all]` 在目标 skill 目录不存在时，自动创建目标目录与基础 `SKILL.md` 模板。
- 自动创建流程需要交互式引导用户补充至少必要的 skill 元信息，避免生成无法继续使用的空模板。
- 自动创建后，继续按照既有逻辑生成或更新 `skill-deps.json` 与 `skill-deps.lock.json`。
- `--all` 模式下，自动创建目标 skill 后仍需继续扫描当前目录下的合法 skillDir 作为引用 skill，并自动排除目标 skill 自身。
- 引用依赖 skill 仍要求能解析到已有目录和有效版本。
- 同步更新 CLI 文档与说明，明确 `build` 现在支持初始化目标 skill。

## 非目标
- 不把 `build` 扩展成完整的 skill scaffold 工具，不在本需求中生成复杂目录结构、引用文件或额外模板资源。
- 不改变引用依赖 skill 的定位方式与版本解析规则。
- 不在本需求中新增远程查询默认版本、自动发布或自动格式化等能力。

## 用户验收标准与风险
- 验收标准：
  - 当目标 skill 不存在时，`skr build work-helper ...` 会创建 `work-helper/SKILL.md`、`skill-deps.json`、`skill-deps.lock.json`。
- 交互式流程会提示填写必要元信息，最终生成的 `SKILL.md` 含合法 frontmatter，且包含 `metadata.version`。
- `skr build <missingSkill> --all` 会先创建目标 skill，再批量写入当前目录中其他 skillDir 的依赖。
  - 已存在的 skill 执行 `skr build` 时，追加/更新依赖行为不回归。
  - CLI 构建校验通过，相关文档更新完成。
- 风险：
  - 交互流程如果默认值设计不清晰，可能生成内容质量较差的模板。
  - `build` 命令职责扩大后，帮助文案与错误提示若未同步，用户可能误判可用边界。

## 需求优化建议
- 建议为自动创建的模板提供清晰默认占位文本，并在提示中说明后续可以使用 `skr format` 或手工编辑继续完善；收益是首次创建路径更顺畅，代价是需要维护模板文案，风险是占位文本若过度泛化会降低模板可读性。
- 建议把交互提示收敛为少量必填项，仅覆盖当前写依赖所需元信息；收益是降低输入成本，代价是首次模板信息不够完整，风险是部分用户仍需二次编辑正文内容。
- 建议在无 TTY 场景下直接给出明确失败信息，而不是尝试进入交互；收益是脚本环境行为可预期，代价是非交互环境无法自动生成模板，风险是用户需要先手动创建目标 skill。
