# skuare

本地优先的 Skill Registry，用来像“包管理”一样管理 AI Skill。  
核心价值是把“Skill 本体 + 依赖关系”一起纳入版本化管理：可追踪、可回滚、可验证。

## 为什么用 skuare
- 统一管理 Skill 版本：按 `<skill_id>/<version>` 存储，便于审计与回溯。
- 依赖管理内建：通过依赖清单描述关系，上传与安装时可递归处理依赖链。
- 本地开发体验好：`local` 模式下快速启动，适合调试与迭代。
- 生产模式可收敛：`remote` 模式对写操作启用签名校验。

## 项目组成
- `skuare-svc`：后端服务（Skill 存储与 API）。
- `skuare-cli`：命令行工具（`skr` / `skuare`）。

默认仓库根路径：`$HOME/.skuare`

## 命令分组
- 纯本地命令：`help`、`version`、`init`、`build`、`format`
  - 主要作用：生成或修改本地配置、Skill 文件、依赖文件
  - 默认不访问 server
- server 只读命令：`health`、`list`、`peek`、`validate`
  - 主要作用：检查服务状态、查询远程仓库内容、触发服务端校验
  - 会访问 server，但不写远程仓库
- 混合命令：`get`
  - 主要作用：从 server 拉取 Skill，并安装到本地局部仓库
  - 同时访问 server 和写本地仓库
  - 默认安装根目录：`~/.skuare`
- server 写命令：`publish`、`create`、`delete`
  - 主要作用：写远程仓库
  - 是否允许无签名写入由服务端决定；CLI 只有在提供签名凭证时才附加签名

## 核心能力：依赖管理
- 依赖描述文件：`skill-deps.json`
- 依赖锁定文件：`skill-deps.lock.json`
- `skr publish --dir <skill-dir>`：读取依赖描述并递归上传依赖 Skill 到远程仓库。
- `skr build <skillName> [refSkill...] [--all]`：为本地 skill 自动创建或追加更新依赖文件（`skill-deps.json` / `skill-deps.lock.json`），当目标 skill 不存在时会先交互式创建最小 `SKILL.md` 模板，支持 `alias=refSkill`；`--all` 会将当前目录下全部合法 skillDir 作为引用 skill。
- `skr get <skill-id> [--scope global|workspace]`：从远程仓库拉取 Skill 到本地局部仓库，并平铺安装其依赖。
  - global 默认仓库根：`~/.skuare`
  - workspace 默认仓库根：`<cwd>/.skuare`
  - 实际安装目录：`<repoRoot>/repos/<scope>/<tool>/<skillID>/...`

示例：
- 若 `a` 依赖 `b` 和 `c`，执行 `skr get a` 后，目标工具目录下会得到 `a`、`b`、`c` 三个技能目录。

## Quick Start
```bash
# 1) 启动后端（本地模式，守护进程）
make start-be LOCAL_MODE=true DAEMON=true

# 2) 安装 CLI
make install-skr
export PATH=/tmp/skuare-bin/bin:$PATH

# 若仓库已自带 skuare-cli/dist，skr 会优先复用预构建产物；
# 只有在需要重建且本地具备 TypeScript 工具链时才会重新编译。
# 若当前只能回退到旧 dist，`skr publish ...` 会桥接为旧命令 `create ...` 以保持基础兼容。

# 3) 初始化（可选）
skr init

# 4) 健康检查
skr health

# 5) 纯本地命令：初始化/构建/格式化
skr build observability-orchestrator core-time-utils report-generator
skr build observability-orchestrator --all
skr format ./skills/observability-orchestrator

# 6) server 只读命令：健康检查/查询
skr health
skr list
skr peek observability-orchestrator

# 7) server 写命令：发布 Skill（会递归处理依赖）
skr publish --dir ./skills/observability-orchestrator

# 8) 混合命令：拉取到本地局部仓库（会平铺安装依赖）
skr get observability-orchestrator --scope workspace

# 9) 停止后端守护进程
make stop-be
```

## 常用命令
- 纯本地命令：
```bash
skr build observability-orchestrator core-time-utils report-generator
skr format ./skills/observability-orchestrator
skr format --all
```

- server 只读命令：
```bash
skr health
skr list --q observability
skr list --rgx "report|alert"
skr peek observability-orchestrator
skr peek --rgx "^skuare/report-generator@"
skr validate observability-orchestrator 1.0.0
```

- 混合命令：
```bash
skr get --rgx "observability"
skr get observability-orchestrator --scope workspace
skr get observability-orchestrator --scope global --repo-dir ~/.skuare
```

- server 写命令：
```bash
skr publish --dir ./skills/observability-orchestrator
skr create --dir ./skills/observability-orchestrator
skr delete observability-orchestrator 1.0.0
```

## 运行模式
- `local`：服务端本地模式，服务端可放行无签名写请求。
- `remote`：服务端远端模式，通常要求签名写请求。
- CLI 是否附加签名只取决于是否提供 `--key-id` 与 `--privkey-file`。

## 文档导航
- 技术综述：`docs/tech_summary.md`
- 服务端说明：`skuare-svc/README.md`
- CLI 说明：`skuare-cli/README.md`

## 变更记录
- 2026-02-26：README 调整为更通用的 GitHub 风格，保留原有信息并优化表达。
- 2026-02-26：命令语义调整：`peek` 查询、`get` 安装、`format` 格式化，`create` 支持多路径与 `--all`。
- 2026-02-27：`get` 安装目录按 LLMTool 区分（`codex`/`claudecode`/custom），`init` 支持 custom 工具 skills 目录配置。
- 2026-02-27：新增 `build <skillName> [refSkill...]`，支持自动创建/追加 `skill-deps.json` 与 `skill-deps.lock.json`。
- 2026-03-01：`build` 新增 `--all`，可将当前目录下所有合法 skillDir 批量写为引用 skill；目标 skill 缺失时会先交互式初始化最小 `SKILL.md` 模板。
- 2026-03-01：`get` 新增 `--rgx` 正则选 skill；`list/peek` 对外参数名统一为 `--rgx`（兼容旧 `--regex`）。
- 2026-02-28：区分远程仓库与本地局部仓库：`publish` 成为主写命令，`get` 新增 `--scope/--repo-dir/--tool`，默认仓库根统一为 `~/.skuare`。
- 2026-03-01：清理仓库入口风格：`make format` 不再错误要求 `VERSION`，`scripts/dev-up.sh` 默认 `SPEC_DIR` 与主入口保持一致。
- 2026-03-01：`skr` 在回退旧 `dist/index.js` 时会将 `publish` 兼容桥接为旧命令 `create`，避免无 TypeScript 环境下出现 `Unknown command: publish`。
