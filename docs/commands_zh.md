# skuare 命令参考

> [English Version](./commands.md)

> 文档类型：REFERENCE  
> 状态：已完成  
> 更新时间：2026-03-10  
> 适用范围：project-wide

## 示例准备

本文档中的命令示例统一配套仓库根目录下的 `examples/` 样例。

- 纯本地命令：直接针对 `./examples/` 执行。
- 远程相关命令（`list`、`peek`、`get`、`validate`、`delete`）：先启动本地 `skuare-svc`，再执行：

```bash
skr publish --dir ./examples/observability-orchestrator
```

这条命令会递归发布 `observability-orchestrator` 及其依赖链，后续远程示例都以该样例集为基础。

- 若需要测试 `update`，可直接基于已发布的远端样例与本地目录执行：

```bash
skr update ShuangShu/observability-orchestrator ./examples/observability-orchestrator
```

- 若需要测试 `publish --file`，使用仓库自带请求文件：

```bash
skr publish --file ./examples/requests/publish-pdf-reader.json
```

- 若需要测试 `detail` 的多文件读取，先执行一次：

```bash
skr get observability-orchestrator
```

随后可读取该样例自带的 `references/details.md` 与 `notes.txt`。

## 命令分类

### 纯本地命令
默认不访问服务器，操作本地文件和配置。

- `help` - 显示帮助信息
- `version` - 显示版本信息
- `init` - 初始化配置
- `build` - 构建依赖文件
- `format` - 格式化 skill 元数据
- `detail` - 显示本地 skill 文件内容

### 服务器只读命令
访问服务器但不写入远程仓库。

- `health` - 健康检查
- `list` - 列出 skills
- `peek` - 查看 skill 详情
- `validate` - 验证 skill 版本

### 混合命令
访问服务器并写入本地仓库。

- `get` - 安装 skill 及其依赖

### 服务器写命令
写入远程仓库。在 remote 模式下可能需要认证。

- `publish` - 发布 skill 及依赖
- `update` - 为远端已有 skill 发布更大版本
- `create` - publish 的已弃用别名
- `delete` - 删除 skill 版本

---

## 命令详情

### help
显示所有命令的帮助信息。

**用法：**
```bash
skr help
```

**输出：**
显示所有可用命令的用法模式。

---

### version
显示 skuare CLI 版本。

**用法：**
```bash
skr version
```

**输出：**
显示 package.json 中的版本号。

---

### init
交互式初始化全局或工作区配置。

**用法：**
```bash
skr init
```

**行为：**
- 提示选择配置范围（全局或工作区）
- 配置远程服务器地址和端口
- 配置认证凭据
- 选择 LLM 工具（codex、claudecode 或自定义）
- 配置自定义工具 skills 目录

**配置文件：**
- 全局：`~/.skuare/config.json`
- 工作区：`<cwd>/.skuare/config.json`

**配置优先级：**
CLI 参数 > 工作区配置 > 全局配置 > 默认值

---

### health
远程服务器健康检查。

**用法：**
```bash
skr health
```

**行为：**
向 `/healthz` 端点发送 GET 请求。

**输出：**
成功或错误消息及 HTTP 状态。

---

### list
列出远程仓库中的所有 skills。

**用法：**
```bash
skr list
skr list --q <keyword>
skr list --rgx <pattern>
```

**选项：**
- `--q <keyword>` - 按关键字过滤（不区分大小写的子串匹配）
- `--rgx <pattern>` - 按正则表达式过滤（匹配 id/skill_id/name/author/description）

**输出：**
Skills 的 JSON 数组，包含字段：
- `id` - 显示标识符 `<author>/<name>@<version>`
- `name` - Skill 名称
- `author` - Skill 作者
- `skill_id` - 内部 skill ID
- `version` - Skill 版本
- `description` - Skill 描述

**示例：**
```bash
skr list --q observability
skr list --rgx "^ShuangShu/.*@0\.0\.1$"
```

---

### peek
查看 skill 概览或详细版本信息。

**用法：**
```bash
skr peek <skillRef> [version]
skr peek --rgx <pattern> [version]
```

**选项：**
- `--rgx <pattern>` - 通过正则表达式匹配 skill（必须精确匹配一个 skill）

**行为：**
- 不带版本：显示 skill 的所有版本
- 带版本：显示该版本的详细文件列表
- `skillRef` 支持 `skillID`、`name`、`author/name`

**输出：**
包含 skill 元数据和文件信息的 JSON。

**示例：**
```bash
skr peek observability-orchestrator
skr peek observability-orchestrator 0.0.1
skr peek ShuangShu/report-generator 0.0.1
skr peek --rgx "^ShuangShu/report-generator@"
```

---

### get
安装 skill 及其依赖到本地局部仓库。

**用法：**
```bash
skr get <skillRef> [version] [--global]
skr get --rgx <pattern> [version] [--global]
```

**选项：**
- `--rgx <pattern>` - 通过正则表达式匹配 skill（必须精确匹配一个 skill）
- `--global` - 安装到全局目录而非工作区

**安装目录：**
- 工作区（默认）：`<cwd>/.<tool>/skills/<skillID>/`
- 全局：`~/.skuare/.<tool>/skills/<skillID>/`

其中 `<tool>` 是配置的第一个 LLM 工具（codex/claudecode/custom）。

**行为：**
- 从远程仓库拉取 skill
- 从 `skill-deps.lock.json` 解析依赖树
- 将所有依赖作为同级目录安装（平铺结构）
- 如果未指定版本则使用最新版本
- `skillRef` 支持 `skillID`、`name`、`author/name`

**输出：**
包含安装摘要的 JSON：
- `global` - 安装范围
- `llm_tool` - 目标工具
- `target` - 安装根目录
- `skills` - 已安装 skill ID 列表
- `conflicts` - 覆盖的文件列表（如有）

**示例：**
```bash
skr get observability-orchestrator
skr get observability-orchestrator 0.0.1
skr get ShuangShu/observability-orchestrator 0.0.1
skr get observability-orchestrator --global
skr get --rgx "observability"
```

---

### detail
显示本地已安装 skill 的文件内容。

**用法：**
```bash
skr detail <skillName|skillID> [relativePath...]
```

**行为：**
- 从本地安装目录解析 skill
- 如果未指定路径则默认为 `SKILL.md`
- 支持多个相对路径
- 拒绝 skill 目录外的路径

**解析顺序：**
1. 在 `<cwd>/.<tool>/skills/` 中搜索
2. 在 `~/.skuare/.<tool>/skills/` 中搜索

**输出：**
带路径标题的文件内容。

**示例：**
```bash
skr detail observability-orchestrator
skr detail observability-orchestrator SKILL.md
skr detail observability-orchestrator references/details.md notes.txt
```

---

### validate
在远程服务器上验证特定 skill 版本。

**用法：**
```bash
skr validate <skillID> <version>
```

**行为：**
触发服务器端对指定版本的验证。

**输出：**
来自服务器的验证结果。

**示例：**
```bash
skr validate observability-orchestrator 0.0.1
```

---

### build
为本地 skill 构建或更新依赖文件。

**用法：**
```bash
skr build <skillName> [refSkill...]
skr build <skillName> [alias=refSkill...]
skr build <skillName> --all
```

**选项：**
- `--all` - 将当前目录下所有有效 skill 目录用作引用 skills

**行为：**
- 如果缺失则创建 `skill-deps.json` 和 `skill-deps.lock.json`
- 向现有文件追加新依赖
- 支持别名语法：`alias=refSkill`
- 如果目标 skill 不存在则提示创建最小 `SKILL.md`
- 扫描当前目录查找 skill 目录

**示例：**
```bash
cd ./examples
skr build observability-orchestrator api-ingest-pipeline report-generator
skr build report-generator validator=schema-validator
skr build observability-orchestrator --all
```

---

### format
格式化 SKILL.md frontmatter 中的 skill 元数据。

**用法：**
```bash
skr format [skillDir...]
skr format --all
```

**选项：**
- `--all` - 格式化当前目录下的所有 skill 目录

**行为：**
- 交互模式：提示对每个 skill 或批量操作
- 规范化 `metadata.version` 和 `metadata.author` 字段
- 保留其他 frontmatter 内容

**示例：**
```bash
skr format ./examples/observability-orchestrator
skr format ./examples/report-generator ./examples/schema-validator
cd ./examples && skr format --all
```

---

### publish
发布 skill 并递归上传依赖。

**用法：**
```bash
skr publish --file <request.json>
skr publish --skill <SKILL.md> [--skill-id <id>] [--version <v>]
skr publish --dir <skillDir> [--skill-id <id>] [--version <v>]
skr publish <path...> [--all] [--skill-id <id>] [--version <v>]
```

**模式：**
1. **JSON 模式**：`--file <request.json>` - 从请求 JSON 发布
2. **显式 SKILL.md 模式**：`--skill <SKILL.md>` - 版本来自 frontmatter
3. **显式目录模式**：`--dir <skillDir>` - 版本来自 `<dir>/SKILL.md` frontmatter
4. **自动检测模式**：`<path...>` - 检测 SKILL.md、目录或 JSON

**选项：**
- `--all` - 自动检测并发布所有路径
- `--skill-id <id>` - 覆盖 skill ID
- `--version <v>` - 覆盖版本
- `--key-id <id>` - 签名密钥 ID（用于认证）
- `--privkey-file <path>` - 私钥文件（用于认证）

**行为：**
- 从 skill 目录读取 `skill-deps.json`
- 递归解析并上传所有依赖
- 对远程仓库中已存在的版本返回 `WARN`
- 在 remote 模式下需要认证（除非服务器允许未签名写入）

**示例：**
```bash
skr publish --file ./examples/requests/publish-pdf-reader.json
skr publish --dir ./examples/observability-orchestrator
skr publish --skill ./examples/observability-orchestrator/SKILL.md
skr publish ./examples/pdf-reader ./examples/api-debugger --all
```

---

### update
为远端已存在的 skill 发布一个更大的新版本。

**用法：**
```bash
skr update <author>/<skillName> <newSkillDir>
```

**行为：**
- 查询服务端中目标 skill 的现有版本。
- 计算远端 `maxVersion`，只允许使用更大的新版本。
- 交互模式下会给出一个大于 `maxVersion` 的推荐版本作为默认值。
- 将最终选择的新版本写回 `<newSkillDir>/SKILL.md` 的 `metadata.version`。
- 随后复用既有 `publish --dir` 流程上传该目录与依赖。

**限制：**
- 当前仅支持 Skill，不支持 `agentsmd/agmd`。
- 本地 `SKILL.md` 的 `name` 与 `metadata.author` 必须与命令参数一致。
- 非交互模式下，若本地 `metadata.version` 不大于远端 `maxVersion`，命令会直接失败。

**示例：**
```bash
skr update ShuangShu/observability-orchestrator ./examples/observability-orchestrator
```

---

### create
`publish` 命令的已弃用别名。

**用法：**
```bash
skr create ...
```

**行为：**
转发到 `publish` 命令并显示弃用警告。

**建议：**
改用 `skr publish`。

**可复现示例：**
```bash
skr create --dir ./examples/pdf-reader
```

---

### delete
从远程仓库删除特定 skill 版本。

**用法：**
```bash
skr delete <skillID> <version>
```

**行为：**
发送 DELETE 请求以删除指定版本。

**认证：**
在 remote 模式下需要认证。

**示例：**
```bash
skr delete observability-orchestrator 0.0.1
```

---

## 认证

### 签名凭据
写命令（`publish`、`delete`）在 remote 模式下可能需要 Ed25519 签名。

**配置：**
- `auth.keyId` - 密钥标识符
- `auth.privateKeyFile` - 私钥文件路径

**CLI 覆盖：**
```bash
skr publish --dir ./skills/my-skill --key-id <id> --privkey-file <path>
```

### Local 模式
当服务器使用 `--local` 标志运行时，允许未签名写入。

---

## 配置

### 配置文件
- 全局：`~/.skuare/config.json`
- 工作区：`<cwd>/.skuare/config.json`

### 配置 Schema
```json
{
  "remote": {
    "mode": "local | remote",
    "address": "localhost",
    "port": 8080
  },
  "auth": {
    "keyId": "optional-key-id",
    "privateKeyFile": "optional-path-to-key"
  },
  "llmTools": ["codex", "claudecode"],
  "toolSkillDirs": {
    "custom-tool": "/path/to/skills"
  }
}
```

### 优先级
CLI 参数 > 工作区配置 > 全局配置 > 默认值

---

## 相关文档
- 项目 README：`README.md`
- 技术总结：`docs/tech_summary_zh.md`
- 演进路线图：`docs/roadmap_zh.md`
- 依赖格式：`docs/skill_deps_format_zh.md`
- 存储层次结构：`docs/storage_hierarchy_zh.md`
- Skill 引用：`docs/skill_reference_zh.md`
- 示例技能目录：`examples/`
