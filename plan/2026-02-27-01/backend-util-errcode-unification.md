# 后端错误码与通用能力归一计划

> 文档类型：PLAN
> 状态：进行中
> 当前节点状态：验收
> 更新时间：2026-02-27
> 适用范围：skuare-svc/internal, skuare-svc/README.md
> 日期分支：feat/2026-02-27
> 功能分支：feat/2026-02-27-backend-util-errcode-unification-tmp
> Worktree 目录：/tmp/wt-2026-02-27-backend-util-errcode-unification
> 关联规格文件路径：spec/2026-02-27-01/backend-util-errcode-unification.md
> 关联计划文件路径：plan/2026-02-27-01/backend-util-errcode-unification.md

## 目标与范围
- 统一后端错误码定义到 `skuare-svc/internal/util/errcode.go`。
- 下沉业务无关通用能力（通用拒绝错误、参数错误识别）到 `skuare-svc/internal/util`。
- 调整 `internal/http` 与 `internal/authz` 的错误引用，保持外部行为一致。
- 更新 `skuare-svc/README.md` 错误码说明。

## 架构与 API 设计
- 保持现有 API 与错误响应结构不变：`{ "code": "...", "message": "..." }`。
- 在 `internal/util/errcode.go` 维护后端对外错误码常量。
- 在 `internal/util/error.go` 维护业务无关通用错误与错误分类函数：
  - `ErrForbidden`
  - `IsInvalidArgumentError(error) bool`
- `internal/http/error.go` 仅负责“状态码 + 错误码 + message”组装，不再硬编码错误码字符串。
- `internal/authz/signature_verifier.go` 使用 `util.ErrForbidden`，避免跨模块重复定义。

## 分阶段实施步骤
1. 步骤 1：输入为当前错误码分布与错误处理代码 -> 新增 `internal/util/errcode.go` 与 `internal/util/error.go`，定义统一错误码常量与通用错误能力 -> 代码变更位置：`skuare-svc/internal/util/errcode.go`、`skuare-svc/internal/util/error.go` -> 输出：util 层形成可复用错误基础能力。
2. 步骤 2：输入为现有 `http/authz` 错误处理逻辑 -> 改造引用到 util，移除业务模块内重复定义，确保错误映射行为不变 -> 代码变更位置：`skuare-svc/internal/http/error.go`、`skuare-svc/internal/http/handler.go`、`skuare-svc/internal/http/handler_test.go`、`skuare-svc/internal/authz/public_key_registry.go`、`skuare-svc/internal/authz/signature_verifier.go` -> 输出：错误码集中管理、通用能力下沉完成。
3. 步骤 3：输入为模块 README 与工程验证要求 -> 更新错误码文档并执行全量单测与构建 -> 代码变更位置：`skuare-svc/README.md`、`skuare-svc/*` -> 输出：文档与实现一致，验证记录可追踪。

## 验收标准与风险
- 验收标准：
  - `util/errcode.go` 存在且被 `internal/http/error.go` 使用。
  - 通用能力放入 `internal/util`，业务模块不再重复定义同类能力。
  - `cd skuare-svc && go test ./...` 全量通过。
  - `cd skuare-svc && go build ./...` 通过。
  - 用户验收通过。
- 风险：
  - 错误对象迁移可能引发遗漏引用。
  - 文档未同步会导致接口协作误解。

## 分支与 Worktree 关联
- 日期分支：`feat/2026-02-27`
- 功能分支：`feat/2026-02-27-backend-util-errcode-unification-tmp`
- Worktree：`/tmp/wt-2026-02-27-backend-util-errcode-unification`
- 目标合入分支：`feat/2026-02-27`
- 关联 PR：TBD

## 开发中问题与解决
- 问题：按规范建议的 worktree 目录 `../wt-...` 在当前 sandbox 不可写。
- 解决：保持分支隔离不变，改在可写目录 `/tmp` 创建独立 worktree 执行开发，避免修改集成目录业务代码。
- 问题：`go test ./...` 默认使用 `~/.cache/go-build`，在 sandbox 下无写权限。
- 解决：执行测试与构建时显式设置 `GOCACHE=/tmp/go-cache-skuare-backend-util`。

## 结束回写
- 待用户确认“同意结束”后填写。

## 需求设计
### Log
- [2026-02-27 00:45] 明确目标：统一错误码到 util/errcode.go，并将业务无关通用能力下沉到 util 目录。
- [2026-02-27 00:45] 明确边界：不调整 API 协议与状态码，不引入新错误码。

## 开发 1
### Log
- [2026-02-27 00:45] 新增 `internal/util/errcode.go`，定义统一错误码常量。
- [2026-02-27 00:45] 新增 `internal/util/error.go`，下沉 `ErrForbidden` 与参数错误识别函数。
- [2026-02-27 00:45] 改造 `internal/http` 与 `internal/authz` 对 util 的引用，去除重复定义。
- [2026-02-27 00:45] 更新 `skuare-svc/README.md` 错误码约定章节。

## 验收 1
### Log
- [2026-02-27 00:45] 单测通过记录：待执行 `cd skuare-svc && go test ./...`。
- [2026-02-27 00:45] 用户验收结论：待用户确认。
- [2026-02-27 00:46] 单测通过记录：`cd skuare-svc && GOCACHE=/tmp/go-cache-skuare-backend-util go test ./...` 全量通过。
- [2026-02-27 00:46] 构建通过记录：`cd skuare-svc && GOCACHE=/tmp/go-cache-skuare-backend-util go build ./...` 通过。
