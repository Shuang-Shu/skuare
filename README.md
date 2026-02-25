# skuare

本地优先的 Skill Registry，用来像“包管理”一样管理 AI Skill：可版本化、可追踪、可回滚、可验证。

## 为什么用 skuare
- 统一管理 Skill 版本：按 `<skill_id>/<version>` 存储，便于审计与回溯。
- 本地开发体验好：`local` 模式下快速启动，适合调试与迭代。
- 生产模式可收敛：`remote` 模式对写操作启用签名校验。
- 依赖可组合：支持通过依赖清单递归上传与安装。

## 项目组成
- `skuare-svc`：后端服务（Skill 存储与 API）。
- `skuare-cli`：命令行工具（`skr` / `skuare`）。

默认存储路径：`$HOME/.skuare/skills`

## Quick Start
```bash
# 1) 启动后端（本地模式）
make start-be LOCAL_MODE=true

# 2) 安装 CLI
make install-skr
export PATH=/tmp/skuare-bin/bin:$PATH

# 3) 初始化（可选）
skr init

# 4) 健康检查
skr health

# 5) 创建 Skill（支持递归处理依赖）
skr create --dir ./skills/observability-orchestrator

# 6) 查看列表
skr list
```

## 常用命令
```bash
skr health
skr list --q observability
skr peek observability-orchestrator
skr get observability-orchestrator
skr create --dir ./skills/observability-orchestrator
skr format ./skills/observability-orchestrator/SKILL.md 1.0.0
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
