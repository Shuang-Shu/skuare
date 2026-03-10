# Skill 引用能力

> [English Version](./skill_reference.md)

> 文档类型：TECH  
> 状态：已完成  
> 更新时间：2026-03-11  
> 适用范围：project-wide

## 目标
- 定义 skuare 中 Skill 如何引用其他 Skill。
- 明确依赖声明与内容引用的关系。
- 提供跨 Skill 引用的最佳实践。

## 引用机制

### 1. 依赖声明
依赖在 `skill-deps.json` 中声明，在 `skill-deps.lock.json` 中锁定，不在 `SKILL.md` frontmatter 中声明。

**文件：skill-deps.json**
```json
{
  "dependencies": [
    { "skill": "data-normalizer", "version": "1.0.0" },
    { "skill": "schema-validator", "version": "1.0.0", "alias": "validator" }
  ]
}
```

**用途：**
- 声明 Skill 的运行时依赖。
- 在 `skr publish` 时启用递归依赖解析。
- 在 `skr get` 时启用平铺依赖安装。

**关键字段：**
- `skill`：Skill 名称（必填）。
- `version`：语义化版本（必填）。
- `alias`：可选的短名称，用于内容引用。

完整 schema 见：`docs/skill_deps_format_zh.md`。

### 2. 内容引用
`SKILL.md` 正文中的跨 Skill 引用使用统一格式：

```
{{ <author>/<name>@<version> }}
```

**示例：**
```markdown
## 工作流
1. 触发 {{ ShuangShu/api-ingest-pipeline@1.0.0 }} 收集数据。
2. 使用 {{ ShuangShu/data-normalizer@1.0.0 }} 清洗记录。
3. 应用 {{ ShuangShu/schema-validator@1.0.0 }} 进行验证。
```

**用途：**
- 在文档中提供明确的、版本固定的引用。
- 使工具能够解析和验证跨 Skill 链接。
- 维护跨 Skill 版本的可追溯性。

**格式规则：**
- 必须包含 `author`、`name` 和 `version`。
- 使用 `/` 分隔 author 和 name。
- 使用 `@` 分隔 name 和 version。
- `{{ }}` 内允许空格但非必需。

### 3. 别名使用
当依赖声明了 `alias` 时，可以在内容中使用简写：

**skill-deps.json：**
```json
{
  "dependencies": [
    { "skill": "schema-validator", "version": "1.0.0", "alias": "validator" }
  ]
}
```

**SKILL.md：**
```markdown
应用 {{ validator }} 检查数据完整性。
```

**注意：**
- 别名仅在当前 Skill 内有效，不会传播。
- 工具应在处理时将别名解析为完整引用。
- 别名必须匹配模式 `^[A-Za-z0-9._-]+$`。

## 工作流集成

### 构建依赖
使用 `skr build` 创建或更新依赖文件：

```bash
# 添加特定依赖
skr build observability-orchestrator api-ingest-pipeline report-generator

# 添加当前目录下所有 skill
skr build observability-orchestrator --all

# 添加带别名的依赖
skr build report-generator validator=schema-validator
```

**行为：**
- 如果缺失则创建 `skill-deps.json` 和 `skill-deps.lock.json`。
- 向现有文件追加新依赖。
- 如果目标 skill 不存在，提示创建最小 `SKILL.md`。

### 发布依赖
`skr publish` 递归上传依赖：

```bash
skr publish --dir ./skills/observability-orchestrator
```

**行为：**
- 从 skill 目录读取 `skill-deps.json`。
- 递归解析并上传所有依赖。
- 对远程仓库中已存在的版本返回 `WARN`。

### 安装依赖
`skr get` 拉取 skill 并平铺安装其依赖：

```bash
# 安装到工作区 (./<tool>/skills/)
skr get observability-orchestrator

# 安装到全局 (~/.<tool>/skills/)
skr get observability-orchestrator --global
```

**行为：**
- 从远程仓库拉取目标 skill。
- 从 `skill-deps.lock.json` 解析依赖树。
- 将所有依赖作为同级目录安装（平铺结构）。

**示例结果：**
```
.codex/skills/
├── observability-orchestrator/
├── api-ingest-pipeline/
├── report-generator/
└── alert-router/
```

## 最佳实践

### 1. 版本固定
始终在 `skill-deps.json` 中指定精确版本：
```json
{ "skill": "core-time-utils", "version": "1.0.0" }
```

避免版本范围或通配符以确保可重现性。

### 2. 最小依赖
仅声明直接依赖。传递依赖会自动解析。

**示例：**
如果 `report-generator` 依赖 `data-normalizer`，而 `observability-orchestrator` 依赖 `report-generator`，则 `observability-orchestrator` 不应直接声明 `data-normalizer`。

### 3. 显式引用
在关键文档章节使用完整引用：
```markdown
{{ ShuangShu/schema-validator@1.0.0 }}
```

在实现细节中对频繁提及的依赖使用别名。

### 4. 依赖卫生
- 运行 `skr format` 规范化 `skill-deps.json` 结构。
- 提交 `skill-deps.lock.json` 以确保可重现安装。
- 在代码审查期间审查依赖变更。

## 引用解析

### 本地开发
在本地开发期间，引用是信息性的。工具可能：
- 验证引用的 skill 存在于 `skill-deps.json` 中。
- 检查引用间的版本一致性。
- 生成依赖图。

### 运行时行为
在运行时（LLM 加载 skill 时），系统：
- 读取 `skill-deps.lock.json` 确定精确版本。
- 从本地安装目录加载依赖。
- 将别名解析为完整 skill 标识符。

## 限制与未来工作

### 当前限制
- `SKILL.md` 内容中无自动别名解析。
- 无验证内容引用是否匹配声明的依赖。
- 无循环依赖检测。

### 计划增强
- `skr validate` 检查引用一致性。
- 依赖图可视化。
- `skr publish` 时自动展开别名。

## 相关文档
- 依赖文件格式：`docs/skill_deps_format_zh.md`
- 存储层次结构：`docs/storage_hierarchy_zh.md`
- 技术总结：`docs/tech_summary_zh.md`
