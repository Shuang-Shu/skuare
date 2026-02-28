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

默认存储路径：`$HOME/.skuare/skills`

## 核心能力：依赖管理
- 依赖描述文件：`skill-deps.json`
- 依赖锁定文件：`skill-deps.lock.json`
- `skr create --dir <skill-dir>`：读取依赖描述并递归上传依赖 Skill。
- `skr build <skillName> [refSkill...]`：为本地 skill 自动创建或追加更新依赖文件（`skill-deps.json` / `skill-deps.lock.json`），支持 `alias=refSkill`。
- `skr get <skill-id>`：按配置的 `llmTool` 安装目标 Skill，并平铺安装其依赖。
  - `codex` 默认安装到当前目录 `./skills`
  - `claudecode` 默认安装到 `~/.claudecode/skills`
  - custom 默认安装到 `~/.<toolName>/skills`（可在 `skr init` 里覆盖）

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

# 3) 初始化（可选）
skr init

# 4) 健康检查
skr health

# 5) 创建 Skill（会递归处理依赖）
skr create --dir ./skills/observability-orchestrator

# 6) 安装 Skill（会平铺安装依赖）
skr get observability-orchestrator

# 7) 查看列表
skr list

# 8) 停止后端守护进程
make stop-be
```

## 常用命令
```bash
skr health
skr list --q observability
skr list --regex "report|alert"
skr peek observability-orchestrator
skr peek --regex "^skuare/report-generator@"
skr get observability-orchestrator
skr create --dir ./skills/observability-orchestrator
skr build observability-orchestrator core-time-utils report-generator
skr format ./skills/observability-orchestrator
skr format --all
skr validate observability-orchestrator 1.0.0
skr delete observability-orchestrator 1.0.0
```

## 运行模式
- `local`：开发优先，写操作免签名。
- `remote`：生产优先，写操作需签名。

## 文档导航
- 技术综述：`docs/tech_summary.md`
- 服务端说明：`skuare-svc/README.md`
- CLI 说明：`skuare-cli/README.md`

## 变更记录
- 2026-02-26：README 调整为更通用的 GitHub 风格，保留原有信息并优化表达。
- 2026-02-26：命令语义调整：`peek` 查询、`get` 安装、`format` 格式化，`create` 支持多路径与 `--all`。
- 2026-02-27：`get` 安装目录按 LLMTool 区分（`codex`/`claudecode`/custom），`init` 支持 custom 工具 skills 目录配置。
- 2026-02-27：新增 `build <skillName> [refSkill...]`，支持自动创建/追加 `skill-deps.json` 与 `skill-deps.lock.json`。
- 2026-02-28：`list/peek` 新增 `--regex` 正则匹配能力（`peek` 需唯一命中）。 
