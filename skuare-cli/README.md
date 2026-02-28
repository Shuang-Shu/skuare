# skuare-cli

> 文档类型：README
> 状态：已完成
> 更新时间：2026-02-28
> 适用范围：skuare-cli

## 目标与范围
- 提供 Skuare 命令行入口，作为前端控制层调用 `skuare-svc`。
- 通过统一 `--server` 参数对接后端 HTTP API，实现基础 Skill 管理链路。

## 架构与 API 设计
- 运行时：Node.js（>=20），入口文件 `src/index.ts`。
- 配置文件：
  - 全局：`~/.skuare/config.json`
  - 工作区：`<workspace>/.skuare/config.json`
  - 其中 `<workspace>` 为执行 `skuare/skr` 命令时的当前目录（`cwd`）
  - 覆盖优先级：`CLI 参数 > 工作区配置 > 全局配置 > 默认值`
- 仓库角色：
  - `skuare-svc`：远程存储仓库（Remote Registry）
  - `skuare-cli`：本地局部仓库（Local Partial Repository）消费者
  - CLI 本地仓库默认根目录：global=`~/.skuare`，workspace=`<cwd>/.skuare`
- 后端地址：
  - 默认由配置项 `remote.address + remote.port` 组合得到
  - CLI 参数 `--server <url>` 优先级最高
- 远端模式：
  - `remote.mode=local`：本地模式，CLI 写操作不附加签名头
  - `remote.mode=remote`：远端模式，CLI 写操作要求签名参数
- 签名参数（写操作）：
  - CLI 参数：`--key-id <id>`、`--privkey-file <path>`
  - 配置项：`auth.keyId`、`auth.privateKeyFile`
- 命令到 API 映射：
  - `health` -> `GET /healthz`
  - `list [--q] [--regex]` -> `GET /api/v1/skills`（`--q` 服务端过滤 + `--regex` 客户端正则过滤）
  - `peek <skillID> [version]` -> `GET /api/v1/skills/:skillID[/version]`
  - `peek --regex <pattern> [version]` -> 先从 `GET /api/v1/skills` 正则筛选唯一 skill，再走 `peek` 详情查询
  - `get <skillID> [version] [--scope] [--repo-dir] [--tool]` -> 从远程仓库拉取到本地局部仓库
    - 默认 scope=`workspace`
    - global 默认仓库根：`~/.skuare`
    - workspace 默认仓库根：`<cwd>/.skuare`
    - 实际安装目标：`<repoRoot>/repos/<scope>/<tool>/<skillID>/...`
    - LOCAL 模式下若 CLI 仓库根与服务端 `remote.storageDir` 相同，会启用共享目录兼容逻辑
  - `publish --file <json>` -> `POST /api/v1/skills`
  - `publish --skill <SKILL.md> [--skill-id] [--version]` -> `POST /api/v1/skills`（显式 `SKILL.md` 模式，版本读取 `metadata.version`）
  - `publish --dir <skillDir> [--skill-id] [--version]` -> `POST /api/v1/skills`（显式目录模式，自动探测 `<dir>/SKILL.md` 并读取 `metadata.version`）
  - `publish <path...> [--all] [--skill-id] [--version]` -> 自动检测每个 path：`SKILL.md` 文件 -> 目录 -> JSON 回退
  - `create ...` -> `publish` 的兼容别名，保留但标记弃用
  - `build <skillName> [refSkill...]` -> 本地生成/追加 `<skillName>/skill-deps.json` 与 `<skillName>/skill-deps.lock.json`（版本来自引用 skill 的 `metadata.version`；支持 `alias=refSkill`）
  - `format [skillDir...]` -> 交互式格式化（先选 `All/Each`，写入 `metadata.version` 与 `metadata.author`）
  - `format --all` -> 直接扫描当前目录下所有 skillDir，执行标准格式化流程
  - `delete <skillID> <version>` -> `DELETE /api/v1/skills/:skillID/:version`
  - `validate <skillID> <version>` -> `POST /api/v1/skills/:skillID/:version/validate`

## 鉴权机制说明
- 写操作（`publish/create`、`delete`）会进行数字签名。
- 当 `remote.mode=local` 时，CLI 会跳过写操作签名。
- CLI 签名参数：
  - 参数：`--key-id <id>`、`--privkey-file <path>`
  - 环境变量：`SKUARE_KEY_ID`、`SKUARE_PRIVKEY_FILE`
- CLI 会自动附加签名头：
  - `X-Skuare-Key-Id`
  - `X-Skuare-Timestamp`
  - `X-Skuare-Nonce`
  - `X-Skuare-Signature`
- 读操作（`health`、`list`、`peek`、`get`、`validate`）不强制要求签名。
- 当服务端返回 `403 FORBIDDEN` 时，优先检查：
  - 是否传了 `--key-id` 与 `--privkey-file`（或对应环境变量）
  - `key_id` 是否已写入 server 端注册文件
  - 私钥是否与注册公钥匹配

## 使用方式（启动/构建/配置）
```bash
cd skuare-cli
npm run check
npm run build
skuare init
skuare help
skuare --server http://127.0.0.1:15657 health
# 或
skr help
```

- 根目录 `skr` 会优先执行自动重建；若本地缺少 TypeScript 工具链但仓库中已存在 `skuare-cli/dist/index.js`，则会输出 `WARN` 并回退到现有预构建产物继续运行。
- 若 `dist/index.js` 不存在，`skr` 仍会因无法完成构建而直接失败；此时需要先在 `skuare-cli` 目录执行 `npm install && npm run build`。

后端二进制自动安装（GitHub Releases）：
- `postinstall` 默认不下载后端，避免开发环境无网络时阻塞。
- 设置 `SKUARE_AUTO_INSTALL_BACKEND=1` 后，安装 CLI 时会尝试下载后端二进制。
- 必填环境变量：
  - `SKUARE_RELEASE_REPO`：GitHub 仓库，格式 `owner/repo`
- 可选环境变量：
  - `SKUARE_SVC_VERSION`：指定版本（如 `v0.1.0`），默认 `latest`
  - `SKUARE_SVC_BIN_DIR`：安装目录，默认 `~/.skuare/bin`
  - `GITHUB_TOKEN`：私有仓库或高频调用时建议设置

示例：
```bash
cd skuare-cli
SKUARE_AUTO_INSTALL_BACKEND=1 \
SKUARE_RELEASE_REPO=your-org/skuare \
SKUARE_SVC_VERSION=v0.1.0 \
npm install
```

`skuare init` 交互项（带预填默认值）：
- 远端模式：`local` / `remote`（方向键选择）
- 当选择 `remote` 时需要输入远端地址与端口。
- 当选择 `local` 时默认使用 `127.0.0.1:15657`。
- 配置作用域：`global` / `workspace`（单选，方向键 ↑/↓ 选择，Enter 确认）
- 默认作用域规则：
  - global 配置不存在：默认 `global`
  - global 配置存在：默认 `workspace`
- 若当前目录位于 `~/.skuare`（全局配置目录）内：禁止创建 workspace 配置，`init` 会强制使用 `global`
- `init` 启动时会先检测全局配置文件是否存在，并以彩色状态显示：`[EXISTS]` / `[NOT EXISTS]`
- 当选择 `workspace` 且 global 配置存在时，会先选择工作区初始化模式：
  - `1) reuse global`
  - `2) modify`
  - `3) new`
- `modify` 模式会先展示 global 配置快照，再进入字段多选框（↑/↓、Space、Enter），仅对勾选字段进行修改
- 远端仓库地址（`remote.address`）
- 远端仓库端口（`remote.port`）
- 远端仓库存储目录（`remote.storageDir`，默认 `~/.skuare`）
- 输入地址与端口后会执行连通性检测（默认 10s 超时，目标 `http://<addr>:<port>/healthz`）
- 连通性检测失败仅告警，不会在中途触发保存确认；是否落盘统一在最后一步 `Save config now (Y/n)` 决定
- 默认签名 key id（`auth.keyId`）
- 默认私钥文件路径（`auth.privateKeyFile`）
- LLM Tool 多选（`llmTools`）：
  - 预置选项：`codex`、`claudecode`、`custom`
  - 选择方式：方向键 ↑/↓ 移动，Space 勾选，Enter 提交
- 在 `custom` 行按 Space 会立即弹出输入框；提交后会新增一行 `custom: <name>`，可重复添加多个
- 当选中 custom 工具时，`init` 会逐个提示 `Skills directory for custom tool "<name>"`：
  - 预填默认值：`~/.<name>/skills`
  - 支持输入绝对路径、相对路径或 `~/`，保存时会规范化
- 所有字段编辑与 LLM Tool 选择完成后，最后一步会再次确认 `Save config now (Y/n)`，确认后才真正写入配置文件

发布 Skill 示例：
```bash
cat > /tmp/create-skill.json <<'EOF'
{
  "skill_id": "pdf-reader",
  "version": "1.0.0",
  "skill": {
    "description": "Read and analyze PDF files",
    "overview": "Extract text by page range and return structured summary"
  }
}
EOF

skuare --server http://127.0.0.1:15657 publish --file /tmp/create-skill.json

# 从 SKILL.md 发布（自动解析 frontmatter 的 name/description + metadata.version + 正文）
skuare --server http://127.0.0.1:15657 publish --skill ./skills/pdf-reader/SKILL.md

# 从目录发布（自动查找 <dir>/SKILL.md，并打包目录下其他文件到 files）
skuare --server http://127.0.0.1:15657 publish --dir ./skills/pdf-reader

# 自动检测多个 source 路径；可叠加 --all 扫描当前目录所有子目录
skuare --server http://127.0.0.1:15657 publish ./skills/pdf-reader ./skills/api-debugger
skuare --server http://127.0.0.1:15657 publish --all
skuare --server http://127.0.0.1:15657 publish /tmp/create-skill.json

# 可选：传 --version 做一致性校验（与 frontmatter metadata.version 不一致会报错）
skuare --server http://127.0.0.1:15657 publish --dir ./skills/pdf-reader --version 1.0.0

# 拉取到本地局部仓库
skuare get pdf-reader --scope workspace
skuare get pdf-reader --scope global --repo-dir ~/.skuare

# 本地构建依赖文件（add 语义，存量依赖会保留并增量更新）
skuare build report-generator data-normalizer schema-validator
# 支持别名
skuare build report-generator normalizer=data-normalizer schema=schema-validator
```

`publish` 依赖上传行为：
- 若来源是 `--skill`/`--dir`/`<path>` 且解析到技能目录，CLI 会读取 `skill-deps.json` 并递归上传依赖技能。
- 依赖已存在（`409 SKILL_VERSION_ALREADY_EXISTS`）会自动跳过。
- 依赖目录默认按同级目录解析（例如 `skills/<depSkillID>`）。
- 当前 skill 若已存在（`409 SKILL_VERSION_ALREADY_EXISTS`），CLI 输出 `WARN` 并返回成功，不再报错退出。

`build` 依赖文件行为：
- 命令格式：`skuare build <skillName> [refSkill...]`。
- 若目标 skill 缺少依赖文件，则自动创建 `skill-deps.json` 与 `skill-deps.lock.json`。
- 若目标 skill 已有依赖文件，则采用 add 语义：保留历史依赖，并对本次 `refSkill` 做追加/同名更新。
- `skill-deps.lock.json` 固定输出 `lock_version: 1`，并为每个依赖写入 `resolved` 字段。
- 可选别名：`refSkill` 可写为 `alias=refSkill`，落盘后依赖项会包含 `alias` 字段。

`list` 输出字段：
- `skr list` 展示：`id`、`name`、`author`、`skill_id`、`version`、`description`。
- 其中 `id` 格式为：`<author>/<name>@<version>`，并固定先于 `name` 展示。
- 当作者信息缺失时，`author` 回退为 `undefined`。
- `skr list --regex <pattern>` 会在 `id/skill_id/name/author/description` 上执行正则匹配。

`peek` 输出字段：
- `skr peek <skillID> <version>` 展示：`id`、`name`、`author` 及该版本详情字段。
- `skr peek <skillID>` 展示：`id`（latest）、`name`、`author`、`versions` 与 `ids`（每个版本对应的完整 id）。
- `skr peek --regex <pattern> [version]` 要求正则命中唯一 skill；0 命中或多命中会报错并提示。

写操作示例（携带公钥）：
```bash
skuare --server http://127.0.0.1:15657 \
  --key-id writer-a \
  --privkey-file ~/.skuare/keys/writer-a.pem \
  publish --dir ./skills/pdf-reader
```

## 验收标准与风险
- 验收标准：
  - `npm run check` 与 `npm run build` 通过。
  - CLI 命令路径与 `skuare-svc/docs/openapi.yaml` 保持一致。
- 风险：
  - 服务不可达时命令失败。
  - 运行环境若禁用本地监听端口，无法完成端到端联调。
- 缓解：
  - 明确错误输出包含 HTTP 状态与响应体。
  - 在支持端口监听的环境执行联调脚本。

## 变更记录
- 2026-02-23：新增后端联动命令（health/list/get/create/delete/validate/reindex）与 `--server` 全局参数。
- 2026-02-23：CLI 命令入口简化为 `skuare` 与 `skr`，并保留 `skuare-cli` 兼容别名。
- 2026-02-23：升级写操作鉴权为数字签名：新增 `--key-id`、`--privkey-file` 与对应环境变量。
- 2026-02-24：`create` 新增 `--skill/--dir` 显式模式与 `create <path>` 自动检测（`SKILL.md`/目录优先，失败后 JSON 回退）；`SKILL.md` 模式强制从 frontmatter 读取 `version`，无 version 禁止上传。
- 2026-02-24：`init` 新增 `remote.mode(local/remote)` 配置；`local` 模式下写操作免签名。
- 2026-02-26：命令语义调整：`peek` 承接原查询语义，`get` 改为安装语义；`create` 支持多输入与 `--all`，并强制 `metadata.version`；新增 `format`；客户端移除 `reindex`。
- 2026-02-26：CLI 异常治理：统一抛领域错误；HTTP 失败优先透传服务端 `code/message`；终端保持 `[ERROR]` 风格输出。
- 2026-02-26：`format` 交互增强：改为 `skr format [skillDir...]`，新增 `All/Each` 模式选择；支持 `skr format --all` 扫描当前目录批量格式化并统一写入 `metadata.version`/`metadata.author`。
- 2026-02-27：`get` 安装目录改为按 LLMTool 规则解析（`codex` -> `./skills`，`claudecode` -> `~/.claudecode/skills`）；`init` 支持为 custom 工具配置 skills 目录映射。
- 2026-02-27：新增 `build <skillName> [refSkill...]`，用于本地自动创建/追加 `skill-deps.json` 与 `skill-deps.lock.json`。
- 2026-02-28：`author` 预填与回退默认值统一为 `undefined`（含 `format` 交互与 `list/peek` 展示）。
- 2026-02-28：优化 `list/peek` 展示：新增 `author`，并统一 `id=<author>/<name>@<version>`，且 `id` 先于 `name` 输出。
- 2026-02-28：`list/peek` 新增 `--regex` 正则匹配能力（`peek` 需唯一命中）。 
- 2026-02-28：根目录 `skr` 增加预构建回退逻辑；当本地缺少 TypeScript 工具链但已有 `dist/index.js` 时，`health` 等命令可继续运行。 
- 2026-02-28：`create` 迁移为 `publish`（保留兼容别名）；`get` 新增 `--scope/--repo-dir/--tool`，安装目标改为本地局部仓库 `repos/<scope>/<tool>/...`，并兼容 LOCAL 同目录共享场景。
