# skuare

> 文档类型：README
> 状态：已完成
> 更新时间：2026-02-24
> 适用范围：project-wide

## 目标与范围
- 面向用户提供 `skuare-svc`（后端）与 `skr`（CLI）的一站式 Skill 管理能力。
- 支持本地模式快速开发与远端模式签名写入。
- 规则：禁止创建 `openai.yaml`（避免厂商强耦合）。

## 架构与 API 设计
- 模块：
  - `skuare-svc`：Go + Hertz 服务端。
  - `skuare-cli`：TypeScript CLI（命令入口 `skr` / `skuare`）。
- 核心 API：
  - `GET /healthz`
  - `POST /api/v1/skills`
  - `GET /api/v1/skills`
  - `GET /api/v1/skills/:skillID`
  - `GET /api/v1/skills/:skillID/:version`
  - `DELETE /api/v1/skills/:skillID/:version`
  - `POST /api/v1/skills/:skillID/:version/validate`
  - `POST /api/v1/reindex`
- 默认存储目录：`$HOME/.skuare/skills`。

## 使用方式（启动/构建/配置）
```bash
# 1) 启动后端（本地模式：写操作免签）
make start-be LOCAL_MODE=true

# 可选参数覆盖
make start-be ADDR=127.0.0.1:15657 \
  SPEC_DIR="$HOME/.skuare/skills" \
  AUTHORIZED_KEYS_FILE="$HOME/.skuare/authorized_keys" \
  AUTH_MAX_SKEW_SEC=300

# 2) 安装 skr
make install-skr
export PATH=/tmp/skuare-bin/bin:$PATH

# 3) 初始化 CLI（可选）
skr init

# 4) 常用命令
skr health
skr list
skr create --dir ./skills/observability-orchestrator
skr get observability-orchestrator
```

依赖上传行为：
- `skr create --skill/--dir/<path>` 会读取 `skill-deps.json` 并递归上传依赖。
- 依赖或当前版本已存在时输出 `WARN`，不报错退出。

输出约束：
- `skr list` 仅展示：`skill_id`、`version`、`name`、`description`。
- `skr create` 不展示服务端本地 `path` 字段。

## 验收标准与风险
- 验收标准：
  - `skr health` 可用。
  - `skr create` 可创建（或重复创建时 `WARN`）。
  - `skr list` 输出字段符合约束。
- 风险：
  - 配置的服务地址不一致导致请求打到错误后端。
  - 远端模式未配置签名信息导致写操作失败。

## 变更记录
- 2026-02-24：README 重写为用户快速使用指南。
- 2026-02-24：技术细节迁移到 `docs/tech_summary.md`。
