# skuare 技术综述

> 文档类型：TECH
> 状态：已完成
> 更新时间：2026-03-11
> 适用范围：project-wide

## 目标与范围
- 汇总 `skuare` 当前技术实现、接口约束、配置机制、依赖模型与运维参数。
- 作为 README 的技术补充，面向开发/维护人员。
- 依赖文件精确格式见：`docs/skill_deps_format.md`。
- 分级存储专题说明见：`docs/storage_hierarchy.md`。

## 现状与事实依据
- 模块：
  - `skuare-svc`：文件系统存储模型 `<specDir>/<author>/<skillID>/<version>`。
  - `skuare-cli`：命令式前端，支持 `init/health/list/peek/get/deps/publish/update/create/build/format/delete/validate`；其中 `list/peek/get/detail/publish/create/delete` 通过 `--type skill|agentsmd|agmd` 在 Skill 与 AGENTS.md 间切换。
- 关键配置：
  - 后端默认 `spec-dir`：`$HOME/.skuare/skills`（可由 `SKUARE_SPEC_DIR` 或 `--spec-dir` 覆盖）。
  - `scripts/dev-up.sh` 与 `make start-be` 默认 `SPEC_DIR` 已统一为 `$HOME/.skuare/skills`。
  - 启动参数：`--addr`、`--spec-dir`、`--authorized-keys-file`、`--local`、`--auth-max-skew-sec`。
  - CLI 配置优先级：`CLI 参数 > workspace > global > defaults`。
  - CLI `--server` 既可指向 `skuare-svc` HTTP 地址，也可指向 `git+<repo-url>` Git registry。
  - CLI `remote.mode`：`local` / `remote`，仅描述 HTTP 服务端模式感知，不负责声明服务端存储目录。
  - CLI 本地安装根目录：默认 skill 安装到 `<cwd>/.{tool}/skills/`；加 `--global` 时安装到 `~/.{tool}/skills/`。
  - `agentsmd` 的安装目标为 `<cwd>/.{tool}/AGENTS.md`；加 `--global` 时安装到 `~/.{tool}/AGENTS.md`。
- 鉴权：
  - 写接口在 remote 模式要求 Ed25519 签名头。
  - `local=true` 时后端直接放行写请求。
- 依赖模型：
  - 依赖不在 `SKILL.md` frontmatter 声明。
  - 使用 `skill-deps.json` + `skill-deps.lock.json`。
  - `skill-deps*.json` 字段结构以 `@examples` 目录样例为准。
  - `SKILL.md` 正文跨 Skill 引用格式统一为 `{{ <author>/<name>@<version> }}`。
  - `skr publish` 会递归上传依赖，已存在版本返回 `WARN`；`skr create` 保留为兼容别名并输出弃用提示。
- 输出约束：
  - `skr list` 输出包含 `id/name/author/skill_id/version/description`，其中 `id=<author>/<name>@<version>` 且先于 `name`。
  - `skr list` 支持 `--regex <pattern>` 客户端正则过滤（匹配 `id/skill_id/name/author/description`）。
  - `skr peek` 输出对齐 `id/name/author` 展示规范。
  - `skr peek` 支持 `--regex <pattern>` 唯一匹配后查询详情。
  - `skr get --wrap` 只安装根 Skill，并落盘 `.skuare-wrap.json`；`skr deps` 用于按需查看或安装被包装的依赖子树，且依赖目标已复用 `get` 的 Skill 选择形式（`<author>/<name>@<version> | <author>/<name> | <name>`）。
  - `skr get` / `skr deps --install` 不再静默覆盖本地已安装 skill：TTY 中会先做交互式覆盖确认，共享子 Skill 会标注其他已安装 root 使用者，非 TTY 会直接失败。
  - AGENTS.md 资源已统一复用基础命令入口，通过 `--type agentsmd|agmd` 切换；`list-agmd`、`publish-agentsmd` 等旧后缀命令不再注册，只返回迁移提示。
  - 当 `SKILL.md metadata.author` 存在时，服务端会在 `publish/list/peek` 相关返回中直接透出 `author`。
  - 当 `metadata.author` 缺失时，服务端会落盘到 `_anonymous/<skillID>/<version>`，但 API 返回中的 `author` 仍保持空字符串；只有显式写了 `author: undefined` 才会显示为 `undefined`。
  - `skr publish` 输出不包含服务端本地路径。
  - `skr update` 会先读取远端 `maxVersion`，再要求新版本严格更大；交互模式下会给出推荐版本默认值，并在发布前回写本地 `metadata.version`。
  - `skr format [skillDir...]` 交互式支持 `All/Each`，并统一写入 `metadata.version`/`metadata.author`；`skr format --all` 自动扫描当前目录子技能。
  - `make format` 仅透传 CLI `format` 命令，不再错误要求额外 `VERSION` 参数。
  - `docs/commands*.md` 中的命令示例现已统一绑定仓库 `examples/` 目录中的真实样例；远程命令示例默认围绕 `observability-orchestrator` 样例链路复现。
- 维护说明：
  - CLI 共享解析能力已收敛到独立工具模块（`utils/command_args`、`utils/skill_manifest`、`utils/install_paths`、`utils/skill_workspace`）以及 `commands/resource_type`；`query.ts` 内部的 `get` / `deps` 也已共享同一套 Skill 目标解析流程，不再维护分叉的匹配逻辑。
  - CLI 新增 registry facade；命令层不再直接绑定 HTTP client，Git repo backend 与未来 backend 通过兼容层接入。
  - 后端 handler/store 仅采用轻量辅助方法收敛重复 JSON 响应与版本化资源文件流程，刻意避免引入过重的统一资源框架。

## 差距分析
- 文档层面：
  - 过去 README 承载过多实现细节，用户上手路径不清晰。
- 运行层面：
  - 本地模式与远端模式混用时，容易出现“CLI 配置与后端启动参数不一致”。
- 协议层面：
  - 依赖递归上传当前按目录约定解析（`skills/<depSkillID>`），跨仓库依赖未统一。

## 建议演进路径
- 参数统一：
  - 增加 `make doctor` 检查 CLI 配置与后端运行参数一致性。
- 可观测性：
  - 后端增加启动配置回显接口（只读、安全字段）。
- 依赖能力：
  - 支持可配置依赖解析根目录与远端依赖拉取策略。
- 稳定性：
  - 为 `publish/list` 输出格式补充快照测试，避免字段回退。

## 风险与边界
- 本地模式风险：
  - 便于开发，但禁用签名校验，不可直接用于生产。
- 路径风险：
  - 共享 `SPEC_DIR` 可能导致多环境污染，需要明确目录隔离策略。
- 兼容边界：
  - 现有客户端依赖精简输出字段，如需扩展应通过显式开关而非默认变更。

## 相关文档
- 命令参考：`docs/commands_zh.md`
- 演进路线图：`docs/roadmap_zh.md`
- 服务端说明：`skuare-svc/README.md`
- CLI 说明：`skuare-cli/README.md`
