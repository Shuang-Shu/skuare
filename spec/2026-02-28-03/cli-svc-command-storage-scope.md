# CLI/SVC 命令与存储 Scope 区分规格

> 文档类型：SPEC
> 状态：进行中
> 更新时间：2026-02-28
> 适用范围：skuare-cli, skuare-svc, docs
> 关联计划文件路径：plan/2026-02-28-03/cli-svc-command-storage-scope.md

## 背景与目标
- 当前 CLI 与 SVC 在“命令作用域（command scope）”与“存储作用域（storage scope）”上的边界不够清晰，易出现默认行为理解不一致。
- 需要统一定义“服务端远程存储仓库”和“客户端本地局部仓库”的职责边界，以及 CLI/SVC 各自默认 scope 与参数覆盖规则。
- 目标是在不破坏现有可用性的前提下，让用户可以显式控制发布目标和拉取/安装目标，并明确 local 模式下 CLI/SVC 目录复用时的兼容行为。

## 需求范围
- 命令命名与语义规范：
  - 后续命令关键字统一使用 `publish`，历史 `create` 作为兼容别名并标记弃用。
  - “tool install”在本需求中统一对应客户端从服务端拉取到本地局部仓库的安装动作（现有命令为 `get` 语义）。
- 客户端（CLI）scope 规范：
  - 本地仓库默认目录为 `~/.skuare`。
  - 安装命令支持 `global` 与 `workspace` 两种 scope，其中 `workspace` 为默认值。
  - 允许通过参数显式指定 scope（参数优先级高于默认值）。
- 服务端（SVC）scope 规范：
  - 默认使用系统文件系统（System FS），默认存储位置为 `~/.skuare`。
  - 在 local 模式下，默认存储位置仍为 `~/.skuare`，并允许与 CLI 本地仓库使用同一目录。
- 架构语义规范：
  - 服务端作为远程存储仓库（Remote Registry）。
  - 客户端作为本地局部仓库（Local Partial Repository），可按 scope 存放技能内容，类似 Go 工具链中的多级仓库使用方式。
- LOCAL 模式兼容规范：
  - 当 CLI 与 SVC 复用同一存储目录时，CLI 必须具备兼容逻辑，避免路径冲突、重复覆盖与不可预期写入。
- 文档联动：更新 CLI/SVC README 中对 scope 与默认路径的说明，确保用户文档与行为一致。

## 非目标
- 不改动技能包文件内容与协议格式。
- 不改动签名鉴权流程与错误码语义（除非为 scope 参数校验新增必要错误码）。
- 不在本需求内引入多租户隔离或远端对象存储（如 S3/OSS）能力。

## 用户验收标准与风险
- 用户验收标准：
  - CLI 在未指定参数时，安装命令默认按 `workspace` scope 写入；指定 `--scope global|workspace` 时按参数生效。
  - CLI 与 SVC 的默认本地路径均为 `~/.skuare`，且 local 模式下可指向同一路径协同使用。
  - CLI 的发布命令采用 `publish` 关键字；`create` 仅保留兼容行为并在帮助中标记弃用。
  - CLI/SVC README 明确描述“远程仓库 vs 本地局部仓库”语义、默认值、参数覆盖关系与 local 模式行为。
- 风险：
  - 现有用户脚本可能依赖旧的隐式安装路径，升级后可能出现行为差异。
  - `create` 到 `publish` 的命令迁移可能影响既有自动化脚本。
  - workspace 与 global 目录混用时可能产生重复安装和版本漂移。
  - local 模式共享目录时，CLI 与 SVC 并发写入可能引发文件覆盖风险。

## 需求优化建议
- 建议 1：统一输出“最终生效 scope 与路径”的调试信息（如 `effective_scope`, `effective_root`, `shared_local_dir`）。
  - 收益：降低排障成本，便于脚本核对实际行为。
  - 代价：命令输出字段增加，需兼容既有解析脚本。
  - 潜在风险：若直接修改默认输出格式，可能影响依赖稳定文本的工具链。
- 建议 2：为 `tool install` 增加路径冲突检测与提示（workspace/global 指向同路径时告警）。
  - 收益：提前暴露配置问题，减少覆盖与重复安装。
  - 代价：需要新增路径归一化与比较逻辑。
  - 潜在风险：不同平台路径语义差异（符号链接、大小写）导致误报。
