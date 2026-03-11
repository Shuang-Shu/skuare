# skuare 分级存储机制说明

> 文档类型：TECH
> 状态：已完成
> 更新时间：2026-03-11
> 适用范围：project-wide

## 目标与范围
- 说明 `skuare` 当前“分级存储机制”的真实实现，而不是历史概念或过时配置。
- 拆开描述三类容易混淆的层级：
  - 服务端远程仓库层级
  - CLI 配置层级
  - CLI 本地安装层级
- 补充 `publish` / `get` 的主要数据流，明确边界与常见误区。

## 一句话结论
- 服务端存哪里：只由 `skuare-svc` 启动参数决定。
- CLI 怎么连服务端：由 CLI 参数、workspace 配置、global 配置和默认值共同决定。
- CLI 把 skill 装到本地哪里：由当前 `cwd`、目标 `tool` 和 `--global` 决定。
- CLI 不再维护或推断服务端的真实存储目录。

## 1. 服务端远程仓库层级

### 1.1 仓库根目录
- `skuare-svc` 启动时会解析远程仓库根目录 `SpecDir`。
- 默认值是 `$HOME/.skuare/skills`。
- 可由环境变量 `SKUARE_SPEC_DIR` 或启动参数 `--spec-dir` 覆盖。
- 相关实现：`skuare-svc/internal/config/config.go`。

### 1.2 目录结构
远程仓库根目录下的实际文件结构如下：

```text
<specDir>/
  .skuare/
    index.json
    locks/
      <skillID>.lock
  agentsmd/
    <agentsmdID>/
      <version>/
        AGENTS.md
        meta.json
  <authorDir>/
    <skillID>/
      <version>/
        SKILL.md
        <other files...>
```

- `<authorDir>/<skillID>/<version>/` 是 skill 版本的真实存储目录。
- 当 `metadata.author` 缺失时，文件系统落盘目录会回退到 `_anonymous`。
- `.skuare/index.json` 是服务端索引文件。
- `.skuare/locks/` 保存按 `skillID` 维度的文件锁。
- 相关实现：`skuare-svc/internal/store/fs_store.go`。

### 1.3 服务端写入行为
- `publish/create` 最终写入 `<specDir>/<authorDir>/<skillID>/<version>/`。
- 创建版本时会先写临时目录，再 rename 为正式目录，降低半写入状态暴露风险。
- `delete` 删除的是某个 `<authorDir>/<skillID>/<version>` 目录，并会顺带清理回溯路径上的空父目录。
- `list/get/peek/validate` 都基于该远程仓库读取。
- 若手动迁移了磁盘目录，需额外调用一次 `POST /api/v1/reindex` 重建 `.skuare/index.json`。

## 2. CLI 配置层级

### 2.1 配置文件位置
CLI 有两层本地配置：

- global 配置：`~/.skuare/config.json`
- workspace 配置：`<cwd>/.skuare/config.json`

这里的 `cwd` 是执行 `skuare` / `skr` 命令时的当前目录。

### 2.2 配置合并优先级
CLI 最终配置优先级为：

```text
CLI flags > workspace config > global config > defaults
```

含义是：
- 命令行参数优先级最高，例如 `--server`、`--key-id`、`--privkey-file`。
- 没有命令行覆盖时，优先读 workspace 配置。
- workspace 缺失时再回退到 global 配置。
- 最后使用内置默认值。

### 2.3 当前配置内容
当前 CLI 默认配置主要包含：

```json
{
  "remote": {
    "mode": "remote",
    "address": "127.0.0.1",
    "port": 15657
  },
  "auth": {
    "keyId": "",
    "privateKeyFile": ""
  },
  "llmTools": ["codex"],
  "toolSkillDirs": {}
}
```

说明：
- `remote.mode` 只表示“目标服务端模式认知”，不表示客户端本地仓库存储模式。
- `remote.address + remote.port` 用于拼接默认 server URL。
- `auth.*` 是写请求签名凭证默认值。
- `llmTools` 和 `toolSkillDirs` 用于本地工具目录选择。

### 2.4 关于 `remote.storageDir`
- 该字段曾被错误暴露在 CLI 初始化流程中。
- 当前实现中，`skr init` 已不再展示、编辑或默认写入 `remote.storageDir`。
- 服务端远程仓库根目录只由服务端启动参数决定，CLI 不再声明该值。
- 历史配置里若残留此字段，当前 CLI 也不会再依赖它推断服务端目录。

## 3. CLI 本地安装层级

### 3.1 tool home 根目录
CLI 拉取 skill 到本地时，会写入目标 tool 的 home 目录：

- workspace tool home（默认）：`<cwd>/.<tool>`
- global tool home：`~/.<tool>`

默认情况下：
- `skr get` 默认安装到 workspace tool home
- 加 `--global` 后切换到用户 home
- 目标 `tool` 覆盖配置中的全部 LLM 工具

### 3.2 最终安装目录
`skr get` 最终安装目标是：

```text
<toolHome>/skills/<skillID>/
```

例如：

```text
<project>/.codex/skills/pdf-reader/
~/.codex/skills/pdf-reader/
```

这两层分别表示：
- `toolHome`：工具本地根目录
- `skillID`：具体技能 ID

### 3.3 为什么还要分 `tool`
同一台机器可能同时服务多个 LLM 工具，因此本地安装目录仍需按 `tool` 分层，避免不同工具的安装结果相互污染。

## 4. tool 目录层级

CLI 维护“工具自己的 home 目录”概念，而 `skr get` 会安装到该目录下的 `skills/` 子目录。

默认规则是：
- `codex` -> `<cwd>/.codex/skills`
- `claudecode` -> `<cwd>/.claudecode/skills`
- 自定义工具 -> `<cwd>/.<tool>/skills`

若配置里提供了 `toolSkillDirs[tool]`，则优先使用显式配置值。

这条线的作用是告诉 CLI 某个工具默认从哪里读取或放置本地 skill 工作目录。对当前 `get` 来说，它也同时构成安装根目录；旧的 `repos/<scope>/<tool>` 模型已经移除。

## 5. 主要数据流

### 5.1 `skr publish`
`skr publish` 的核心路径是：

```text
本地 skill 目录 / SKILL.md / request.json
  -> CLI 解析与打包
  -> HTTP 写请求
  -> skuare-svc
  -> <specDir>/<authorDir>/<skillID>/<version>/
```

关键点：
- CLI 负责读取本地文件、构造请求、按需附加签名。
- 服务端负责最终鉴权、落盘和索引维护。
- 写入的真实目标目录只存在于服务端。

### 5.2 `skr get`
`skr get` 的核心路径是：

```text
skuare-svc 远程版本文件
  -> CLI 拉取 files
  -> 解析依赖
  -> 写入 <toolHome>/skills/<skillID>/
```

关键点：
- `get` 写的是 CLI 本地安装目录，不是服务端远程仓库。
- 若 skill 带依赖，CLI 会继续递归下载依赖并一起写入本地。
- 当前实现不再根据客户端配置猜测服务端是否与本地共享同一目录。

## 6. 边界与常见误区

### 6.1 常见误区 1：CLI 配置决定服务端存储目录
错误。

真实规则是：
- CLI 只决定“连接哪里”和“本地怎么组织配置/安装目录”。
- 服务端存储目录只由 `skuare-svc --spec-dir` 或 `SKUARE_SPEC_DIR` 决定。

### 6.2 常见误区 2：`--global` 表示服务端全局存储
不完整。

`--global` 只影响 CLI 本地安装目标：
- 不带 `--global`：`<cwd>/.<tool>/skills/`
- 带 `--global`：`~/.<tool>/skills/`

但它不影响服务端远程仓库根目录。

### 6.3 常见误区 3：tool 目录和已安装 skill 目录是同一个东西
错误。

它们分别解决不同问题：
- `toolSkillDirs`：工具自己的技能工作目录
- `<toolHome>/skills/<skillID>/...`：`skr get` 安装后的本地 skill 目录

### 6.4 常见误区 4：local 模式等于客户端本地写盘模式
错误。

`remote.mode=local` 表示目标服务端处于 local 模式，是否放行无签名写请求仍由服务端决定。
它不代表 CLI 自己拥有某种“本地共享服务端仓库”的特权目录。

## 7. 当前实现依据
- CLI 配置与路径解析：`skuare-cli/src/config/resolver.ts`
- CLI 配置结构：`skuare-cli/src/types/index.ts`
- CLI 本地安装路径：`skuare-cli/src/commands/query.ts`
- 服务端启动配置：`skuare-svc/internal/config/config.go`
- 服务端文件系统存储：`skuare-svc/internal/store/fs_store.go`

## 8. 维护建议
- 若以后新增服务端能力发现接口，应把“服务端运行参数摘要”与本文同步更新。
- 若以后调整 `get` 的本地目录结构，应同时更新本文第 3 节和第 5 节。
- 若重新引入任何服务端目录相关字段，必须先明确它是“服务端事实回显”还是“客户端配置声明”，不能混用。
