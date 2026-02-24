# skuare-svc

> 文档类型：README
> 状态：已完成
> 更新时间：2026-02-24
> 适用范围：skuare-svc

## 目标与范围
- 提供 SkillHub 后端 HTTP 服务。
- 基于文件系统存储 Skill 规格，目录模型为 `<specDir>/<skillID>/<version>`。

## 架构与 API 设计
- 技术栈：Go + Hertz。
- 分层：`api -> service -> store(fs) -> index`。
- 启动参数：
  - `--addr`：监听地址，默认 `:15657`（可由 `SKUARE_SVC_ADDR` 覆盖）
  - `--spec-dir`：规格根目录，默认 `~/.skuare/skills`（可由 `SKUARE_SPEC_DIR` 覆盖）
  - `--authorized-keys-file`：已注册公钥文件路径（可由 `SKUARE_AUTHORIZED_KEYS_FILE` 覆盖），默认 `<specDir>/.skuare/authorized_keys`
  - `--local`：本地模式，启用后写接口跳过签名鉴权（可由 `SKUARE_LOCAL_MODE` 覆盖，默认 `false`）
  - `--auth-max-skew-sec`：签名时间戳允许偏移秒数（可由 `SKUARE_AUTH_MAX_SKEW_SEC` 覆盖，默认 `300`）
- API：
  - `GET /healthz`
  - `POST /api/v1/skills`
  - `GET /api/v1/skills`
  - `GET /api/v1/skills/:skillID`
  - `GET /api/v1/skills/:skillID/:version`
  - `DELETE /api/v1/skills/:skillID/:version`
  - `POST /api/v1/skills/:skillID/:version/validate`
  - `POST /api/v1/reindex`
- OpenAPI：`skuare-svc/docs/openapi.yaml`
- 错误响应：统一为 `{ "code": "...", "message": "..." }`
- 写操作鉴权：`POST /api/v1/skills`、`DELETE /api/v1/skills/:skillID/:version`、`POST /api/v1/reindex` 需要数字签名请求头（`X-Skuare-Key-Id`/`X-Skuare-Timestamp`/`X-Skuare-Nonce`/`X-Skuare-Signature`）。

## 鉴权机制说明
- 目标：限制 server 端写操作，仅允许“持有已注册公钥对应私钥”的客户端执行写入。
- 作用范围：
  - 需要鉴权：`POST /api/v1/skills`、`DELETE /api/v1/skills/:skillID/:version`、`POST /api/v1/reindex`
  - 不需要鉴权：`GET /healthz`、`GET /api/v1/skills*`、`POST /api/v1/skills/:skillID/:version/validate`
- 公钥来源：
  - 启动参数：`--authorized-keys-file`
  - 环境变量：`SKUARE_AUTHORIZED_KEYS_FILE`
  - 默认路径：`<specDir>/.skuare/authorized_keys`
- 文件规则：
  - 每行一个 `key_id:base64_ed25519_public_key`
  - 空行忽略
  - 以 `#` 开头的行视为注释
- 请求规则：
  - 客户端写请求携带以下头：
    - `X-Skuare-Key-Id`
    - `X-Skuare-Timestamp`（Unix 秒）
    - `X-Skuare-Nonce`（随机串）
    - `X-Skuare-Signature`（base64）
  - 签名原文：`METHOD + "\\n" + PATH + "\\n" + SHA256(BODY_HEX) + "\\n" + TIMESTAMP + "\\n" + NONCE`
  - 服务端用 `key_id` 对应注册公钥验签，并校验时间窗口与 nonce 防重放。
- 拒绝策略：
  - 缺失签名头、key_id 未注册、签名无效、时间戳过期、nonce 重放：返回 `403 FORBIDDEN`
  - 响应体：`{"code":"FORBIDDEN","message":"forbidden"}`
- MVP 边界：
  - 当前未做租户级限流与细粒度权限，只做写接口签名验签。

## 使用方式（启动/构建/配置）
```bash
cd skuare-svc
go test ./...
go build ./...
go run ./cmd/skuare-svc --addr :15657 --spec-dir "$HOME/.skuare/skills"
```

项目根目录也提供本地一键启动脚本（后台启动并健康检查）：
```bash
make start-be
make start-be ADDR=127.0.0.1:18080
make start-be LOCAL_MODE=false
make start-be SPEC_DIR="$HOME/.skuare/skills" GOCACHE=/tmp/go-cache-skuare
make start-be AUTHORIZED_KEYS_FILE="$HOME/.skuare/authorized_keys" AUTH_MAX_SKEW_SEC=300
make start-be BE_ARGS="--auth-max-skew-sec 120"
```

`make start-be` 支持参数覆盖：`ADDR`、`LOCAL_MODE`、`SPEC_DIR`、`GOCACHE`、`AUTHORIZED_KEYS_FILE`、`AUTH_MAX_SKEW_SEC`，并支持 `BE_ARGS` 透传任意后端参数。
建议本地调试使用 `LOCAL_MODE=true`，生产环境保持 `LOCAL_MODE=false`。

注册公钥文件示例（每行一个，支持 `#` 注释）：
```text
# key_id:base64_public_key
writer-a:6l7gW7kX7xQm3D6kNQ8tQ5k7rP9Hq7JX6xF6wq1r5Yk=
```

写请求示例（curl）：
```bash
curl -X POST "http://127.0.0.1:15657/api/v1/reindex" \
  -H "X-Skuare-Key-Id: writer-a" \
  -H "X-Skuare-Timestamp: <unix_ts>" \
  -H "X-Skuare-Nonce: <nonce>" \
  -H "X-Skuare-Signature: <base64_signature>"
```

`POST /api/v1/skills` 示例：
```json
{
  "skill_id": "pdf-reader",
  "version": "1.0.0",
  "skill": {
    "description": "Read and analyze PDF files",
    "overview": "Extract text by page range and return structured summary",
    "sections": [
      {
        "title": "Output Contract",
        "content": "Return 结论/依据/不确定性"
      }
    ]
  }
}
```

## 验收标准与风险
- 验收：全量单测通过，服务可完成创建/查询/删除/校验/重建索引流程。
- 风险：并发写入冲突、异常中断导致索引不一致。
- 缓解：文件锁、临时目录写入+原子重命名、`reindex` 修复入口。

## 变更记录
- 2026-02-23：切换到 Hertz；新增 SkillHub 文件系统存储 MVP API 与存储实现。
- 2026-02-23：创建接口改为结构化 `skill` 协议，移除 `openai_yaml` 与 `skill_md` 直传模式。
- 2026-02-23：新增项目级本地开发编排脚本（dev-up/dev-down/dev-status）。
- 2026-02-23：新增 `--local` / `SKUARE_LOCAL_MODE` 开关，支持本地模式下写接口免签。
- 2026-02-24：新增 `--auth-max-skew-sec` / `SKUARE_AUTH_MAX_SKEW_SEC`，并增强 `make start-be` 参数透传能力。
