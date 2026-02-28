# skuare 技术综述

> 文档类型：TECH
> 状态：已完成
> 更新时间：2026-02-28
> 适用范围：project-wide

## 目标与范围
- 汇总 `skuare` 当前技术实现、接口约束、配置机制、依赖模型与运维参数。
- 作为 README 的技术补充，面向开发/维护人员。
- 依赖文件精确格式见：`docs/skill_deps_format.md`。

## 现状与事实依据
- 模块：
  - `skuare-svc`：文件系统存储模型 `<specDir>/<skillID>/<version>`。
  - `skuare-cli`：命令式前端，支持 `init/health/list/peek/get/publish/create/build/format/delete/validate`。
- 关键配置：
  - 后端默认 `spec-dir`：`$HOME/.skuare`（可由 `SKUARE_SPEC_DIR` 或 `--spec-dir` 覆盖）。
  - 启动参数：`--addr`、`--spec-dir`、`--authorized-keys-file`、`--local`、`--auth-max-skew-sec`。
  - CLI 配置优先级：`CLI 参数 > workspace > global > defaults`。
  - CLI `remote.mode`：`local`（写免签）/`remote`（写需签名）。
  - CLI 本地局部仓库根：global=`$HOME/.skuare`，workspace=`<cwd>/.skuare`；`get` 默认 `--scope workspace`，可通过 `--repo-dir` 覆盖根目录。
  - CLI 最终安装目录：`<repoRoot>/repos/<scope>/<tool>/<skillID>/...`；local 模式下若与服务端 `remote.storageDir` 相同，会启用共享目录兼容逻辑。
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
  - `author` 缺失时默认回退为 `undefined`。
  - `skr publish` 输出不包含服务端本地路径。
  - `skr format [skillDir...]` 交互式支持 `All/Each`，并统一写入 `metadata.version`/`metadata.author`；`skr format --all` 自动扫描当前目录子技能。

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
