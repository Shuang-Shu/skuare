# Skill 树分层存储与加载规范

> 文档类型：TECH
> 状态：已完成
> 更新时间：2026-02-23
> 适用范围：project-wide

## 目标与范围

本规范定义 Skill 的“树形依赖加载 + 分层仓库管理 + 项目内装配”机制。

目标：

1. Skill 以树形依赖表达（每个 Skill 可声明自己的 `skill-deps.json`）。
2. 引用根 Skill 时自动递归加载全部子 Skill。
3. 支持三层来源：远程仓库、用户目录、项目目录。
4. 最终装配到项目运行目录：`<repo>/.skuare/skills/`。
5. 行为对齐成熟包管理器：可复现、可缓存、可离线、可审计。

## 架构与 API 设计

### 三层仓库模型（存储层）

1. 远程仓库（Remote Registry）
- 职责：发布源、版本索引、制品下载、校验信息。
- 特性：只读、中心化、可签名。

2. 用户目录（User Skills Directory）
- 路径：`~/.skuare/skills/`
- 职责：全局缓存与复用，跨项目共享。
- 特性：内容寻址（按 `module@version` + hash 存储）。

3. 项目目录（Project Skills Directory）
- 路径：`<repo>/.skuare/skills/`
- 职责：项目私有镜像层；可固化当前项目所需 Skill 集。
- 特性：优先于用户目录；便于项目隔离与 CI 复现。

### 项目运行视图（装配层）

1. 运行目录：`<repo>/.skuare/skills/`
2. 该目录是运行时读取目录，也是项目装配输出目录。
3. 目录下每个 Skill 目录建议使用唯一坐标命名：
- `<module>@<version>`（避免同名冲突）
4. 每个 Skill 目录仅使用 `skill-deps.json` 和 `skill-deps.lock.json` 两个依赖文件，不新增额外索引文件。

说明：

1. 依赖关系与别名信息由各 Skill 的 `skill-deps.json` 提供。
2. 精确版本与完整性信息由 `skill-deps.lock.json` 提供。
3. 运行器按“当前 Skill 坐标 + alias”构建内存映射，不依赖额外落盘索引。

### 加载优先级（取包顺序）

针对任意 `module@version`，查找顺序：

1. 项目目录 `<repo>/.skuare/skills/`
2. 用户目录 `~/.skuare/skills/`
3. 远程仓库（下载后先落用户目录，再同步到项目目录）

原则：

1. 项目目录命中即直接使用。
2. 用户目录命中则复用并可链接/复制到项目目录。
3. 远程命中后必须校验 hash，再写入本地目录层。

### 树加载与展平算法

1. 读取根 Skill（项目声明的入口 Skill）。
2. 解析根 Skill 的 `skill-deps.json`。
3. 对每个依赖递归执行同样过程，构建依赖 DAG（禁止循环依赖）。
4. 版本决策：优先使用 lock 文件；无 lock 时按 semver 求解并生成 lock。
5. 物料获取：按“项目 -> 用户 -> 远程”顺序取包。
6. 装配输出：将最终闭包写入 `<repo>/.skuare/skills/`。
7. 运行时只读取 Skill 目录下的 `skill-deps.json` 与 `skill-deps.lock.json` 构建依赖图，不再使用额外索引文件。

### 冲突与多版本策略

1. 允许同一 module 多版本并存（目录名带版本）。
2. 别名在“父 Skill 作用域内”唯一，不要求全局唯一。
3. 若根 Skill 显式 pin 版本，与传递依赖冲突时：根优先，冲突写入诊断。
4. 无法求解时失败退出，并输出最小冲突集合。

### Server 端最小能力

1. `GET /v1/modules/{module}/versions`
2. `GET /v1/modules/{module}/{version}/manifest`
3. `GET /v1/blobs/{sha256}`
4. `GET /v1/checksums/{module}/{version}`

Server 仅负责分发与校验元数据，不参与本地优先级决策。

## 分阶段实施步骤

1. 定义仓库目录与展平目录结构（用户/项目/运行视图）。
2. 实现 resolver（递归构图、冲突检测、版本求解）。
3. 实现 fetcher（项目/用户/远程三级取包与校验）。
4. 实现 assembler（输出 `<repo>/.skuare/skills/`）。
5. 实现 runtime loader（基于“当前 Skill + alias”解析调用）。
6. 接入 CI（lock 一致性、离线重建、冲突检测）。

## 验收标准与风险

验收标准：

1. 仅给定根 Skill，系统可递归加载完整 Skill 树并展平。
2. 展平目录删除后可由项目仓库/用户仓库/远程仓库重新构建。
3. 同一仓库、同一 lock 在不同机器得到一致 Skill 目录结构与 lock 内容。
4. 多版本依赖可并存且别名解析无歧义。

风险与控制：

1. 风险：装配后依赖上下文解析错误。
控制：运行时严格基于父 Skill 的 `skill-deps.json` 做作用域化 alias 解析。
2. 风险：缓存污染导致不可复现。
控制：所有制品使用 hash 校验并记录来源层。
3. 风险：远程不可用影响首次安装。
控制：支持项目仓库预热与离线模式。
