# Skill 创作最佳实践

> **说明**：优秀的 Skill 应该简洁、结构清晰，并经过实际使用测试。本指南提供了实用的创作建议，帮助你编写出 Claude 能够有效发现并使用的 Skill。有关 Skill 工作原理的概念性背景，请参阅 [Skill 概述](overview)。

## 核心原则

### 简洁至上

上下文窗口是公共资源。你的 Skill 需要与 Claude 需要知道的所有其他内容共享上下文窗口，包括：

- 系统提示词
- 对话历史
- 其他 Skill 的元数据
- 你的实际请求

并非 Skill 中的每个 token 都有直接成本。启动时，只会预加载所有 Skill 的元数据（名称和描述）。只有当 Skill 变得相关时，Claude 才会读取 SKILL.md，并且仅在需要时读取其他文件。

然而，在 SKILL.md 中保持简洁仍然很重要：一旦 Claude 加载了它，每个 token 都会与对话历史和其他上下文竞争空间。

**默认假设**：Claude 已经非常聪明

只添加 Claude 尚未拥有的上下文。质疑每一条信息：

- "Claude 真的需要这个解释吗？"
- "我能假设 Claude 知道这个吗？"
- "这段内容的 token 成本是否合理？"

**好例子**：简洁（约 50 个 token）

```markdown
## 提取 PDF 文本
使用 pdfplumber 进行文本提取：

```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
```

**坏例子**：过于冗长（约 150 个 token）

```markdown
## 提取 PDF 文本
PDF（Portable Document Format，便携式文档格式）文件是一种包含文本、图像等内容的常见文件格式。
要从 PDF 中提取文本，你需要使用库。有许多可用于 PDF 处理的库，但推荐使用 pdfplumber，
因为它易于使用且能处理大多数情况。

首先，你需要使用 pip 安装它。然后你可以使用下面的代码...
```

简洁的版本假设 Claude 知道什么是 PDF 以及库如何工作。

### 设置适当的自由度

根据任务的脆弱性和可变性匹配具体程度。

**高自由度（基于文本的指令）**

适用场景：
- 多种方法都是有效的
- 决策取决于上下文
- 由启发式方法指导

示例：

```markdown
## 代码审查流程
1. 分析代码结构和组织
2. 检查潜在的错误或边界情况
3. 提出提高可读性和可维护性的建议
4. 验证是否符合项目规范
```

**中自由度（带参数的伪代码或脚本）**

适用场景：
- 存在首选模式
- 可以接受一些变化
- 配置会影响行为

示例：

```markdown
## 生成报告
使用此模板并根据需要自定义：

```python
def generate_report(data, format="markdown", include_charts=True):
    # 处理数据
    # 生成指定格式的输出
    # 可选包含可视化图表
```
```

**低自由度（具体脚本，很少或没有参数）**

适用场景：
- 操作脆弱且容易出错
- 一致性至关重要
- 必须遵循特定顺序

示例：

```markdown
## 数据库迁移
准确运行此脚本：

```bash
python scripts/migrate.py --verify --backup
```
不要修改命令或添加其他标志。
```

**类比**：将 Claude 想象成在路径上探索的机器人：

- **两侧都是悬崖的窄桥**：只有一条安全的前进道路。提供具体的防护措施和精确的指令（低自由度）。例如：必须按确切顺序运行的数据库迁移。

- **无障碍的开阔场地**：多条路径都能通向成功。给出一般性方向并信任 Claude 找到最佳路线（高自由度）。例如：由上下文决定最佳方法的代码审查。

### 使用你计划使用的所有模型进行测试

Skill 作为模型的补充，其有效性取决于底层模型。请使用你计划使用的所有模型测试你的 Skill。

**按模型的测试考虑**：

- **Claude Haiku（快速、经济）**：Skill 是否提供了足够的指导？
- **Claude Sonnet（平衡）**：Skill 是否清晰高效？
- **Claude Opus（强大的推理能力）**：Skill 是否避免了过度解释？

对 Opus 完美运行的内容可能需要为 Haiku 提供更多细节。如果你计划在多个模型中使用 Skill，请确保指令适用于所有模型。

## Skill 结构

**YAML 前置元数据**：SKILL.md 前置元数据需要两个字段：

- `name`：
  - 最多 64 个字符
  - 只能包含小写字母、数字和连字符
  - 不能包含 XML 标签
  - 不能包含保留词："anthropic"、"claude"

- `description`：
  - 必须非空
  - 最多 1024 个字符
  - 不能包含 XML 标签
  - 应该描述 Skill 的功能和使用场景

有关完整 Skill 结构的详细信息，请参阅 [Skill 概述](overview)。

### 命名约定

使用一致的命名模式，使 Skill 更易于引用和讨论。

考虑对 Skill 名称使用**动名词形式**（动词 + -ing），因为这清楚地描述了 Skill 提供的活动或能力。请记住，`name` 字段只能使用小写字母、数字和连字符。

**好的命名示例（动名词形式）**：
- `processing-pdfs`（处理 PDF）
- `analyzing-spreadsheets`（分析电子表格）
- `managing-databases`（管理数据库）
- `testing-code`（测试代码）
- `writing-documentation`（编写文档）

**可接受的替代方案**：
- 名词短语：`pdf-processing`、`spreadsheet-analysis`
- 面向行动：`process-pdfs`、`analyze-spreadsheets`

**避免**：
- 模糊的名称：`helper`、`utils`、`tools`
- 过于通用：`documents`、`data`、`files`
- 保留词：`anthropic-helper`、`claude-tools`
- 技能集合中的不一致模式

一致的命名使得以下操作更加容易：
- 在文档和对话中引用 Skill
- 一目了然地了解 Skill 的功能
- 组织和搜索多个 Skill
- 维护专业、统一的技能库

### 编写有效的描述

`description` 字段用于 Skill 发现，应该包含**Skill 的功能**和**使用场景**。

**始终使用第三人称**。描述会被注入到系统提示词中，不一致的人称会导致发现问题。

- ✅ 好："处理 Excel 文件并生成报告"
- ❌ 避免："我可以帮助你处理 Excel 文件"
- ❌ 避免："你可以使用这个来处理 Excel 文件"

**要具体并包含关键术语**。包括 Skill 的功能以及使用它的具体触发条件/上下文。

每个 Skill 只有一个描述字段。该描述对于技能选择至关重要：Claude 使用它从可能 100+ 个可用 Skill 中选择正确的 Skill。你的描述必须提供足够的细节让 Claude 知道何时选择此 Skill，而 SKILL.md 的其余部分提供实现细节。

**有效示例**：

**PDF 处理技能**：
```yaml
description: 从 PDF 文件中提取文本和表格，填写表单，合并文档。
  当处理 PDF 文件或用户提到 PDF、表单或文档提取时使用。
```

**Excel 分析技能**：
```yaml
description: 分析 Excel 电子表格，创建数据透视表，生成图表。
  当分析 Excel 文件、电子表格、表格数据或 .xlsx 文件时使用。
```

**Git 提交助手技能**：
```yaml
description: 通过分析 git 差异生成描述性的提交消息。
  当用户请求帮助编写提交消息或审查暂存更改时使用。
```

**避免模糊的描述**：
```yaml
description: 帮助处理文档
description: 处理数据
description: 对文件进行操作
```

### 渐进式披露模式

SKILL.md 作为概述，在需要时将 Claude 指向详细材料，就像入职指南中的目录一样。

有关渐进式披露工作原理的解释，请参阅 [Skill 工作原理](how-skills-work)。

**实用建议**：
- 将 SKILL.md 正文保持在 500 行以下以获得最佳性能
- 接近此限制时将内容拆分为单独的文件
- 使用下面的模式有效地组织指令、代码和资源

#### 视觉概览：从简单到复杂

基础 Skill 从仅包含 SKILL.md 文件开始，其中包含元数据和指令：

```
pdf/
└── SKILL.md
```

随着 Skill 的发展，你可以捆绑额外的内容，Claude 仅在需要时加载：

```
pdf/
├── SKILL.md              # 主指令（触发时加载）
├── FORMS.md              # 表单填写指南（按需加载）
├── reference.md          # API 参考（按需加载）
├── examples.md           # 使用示例（按需加载）
└── scripts/
    ├── analyze_form.py   # 实用脚本（执行，不加载）
    ├── fill_form.py      # 表单填写脚本
    └── validate.py       # 验证脚本
```

#### 模式 1：高级指南带参考

```markdown
---
name: pdf-processing
description: 从 PDF 文件中提取文本和表格，填写表单，合并文档。
  当处理 PDF 文件或用户提到 PDF、表单或文档提取时使用。
---

# PDF 处理

## 快速入门
使用 pdfplumber 提取文本：

```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

## 高级功能
- **表单填写**：参见 [`FORMS.md`](FORMS.md) 获取完整指南
- **API 参考**：参见 [`REFERENCE.md`](REFERENCE.md) 获取所有方法
- **示例**：参见 [`EXAMPLES.md`](EXAMPLES.md) 获取常见模式
```

Claude 仅在需要时加载 FORMS.md、REFERENCE.md 或 EXAMPLES.md。

#### 模式 2：特定领域的组织

对于具有多个领域的 Skill，按领域组织内容以避免加载不相关的上下文。

当用户询问销售指标时，Claude 只需要读取销售相关的模式，而不是财务或营销数据。这保持了 token 使用量低且上下文集中。

```
bigquery-skill/
├── SKILL.md（概述和导航）
└── reference/
    ├── finance.md（收入、计费指标）
    ├── sales.md（机会、渠道）
    ├── product.md（API 使用、功能）
    └── marketing.md（活动、归因）
```

**SKILL.md**：
```markdown
# BigQuery 数据分析

## 可用数据集
- **财务**：收入、ARR、计费 → 参见 [`reference/finance.md`](reference/finance.md)
- **销售**：机会、渠道、账户 → 参见 [`reference/sales.md`](reference/sales.md)
- **产品**：API 使用、功能、采用 → 参见 [`reference/product.md`](reference/product.md)
- **营销**：活动、归因、邮件 → 参见 [`reference/marketing.md`](reference/marketing.md)

## 快速搜索
使用 grep 查找特定指标：

```bash
grep -i "revenue" reference/finance.md
grep -i "pipeline" reference/sales.md
grep -i "api usage" reference/product.md
```
```

#### 模式 3：条件性细节

显示基础内容，链接到高级内容：

```markdown
# DOCX 处理

## 创建文档
使用 docx-js 创建新文档。参见 [`DOCX-JS.md`](DOCX-JS.md)。

## 编辑文档
对于简单编辑，可以直接修改 XML。
- **对于跟踪更改**：参见 [`REDLINING.md`](REDLINING.md)
- **对于 OOXML 详情**：参见 [`OOXML.md`](OOXML.md)
```

Claude 仅在用户需要这些功能时读取 REDLINING.md 或 OOXML.md。

### 避免深度嵌套的引用

Claude 可能会部分读取从其他引用文件引用的文件。当遇到嵌套引用时，Claude 可能会使用 `head -100` 等命令预览内容而不是读取整个文件，导致信息不完整。

**保持引用在 SKILL.md 的一层深度**。所有参考文件应该直接从 SKILL.md 链接，确保 Claude 在需要时读取完整文件。

**坏例子**：太深
```markdown
# SKILL.md
参见 [`advanced.md`](advanced.md)...

# advanced.md
参见 [`details.md`](details.md)...

# details.md
这里是实际信息...
```

**好例子**：一层深度
```markdown
# SKILL.md
- **基本用法**：[SKILL.md 中的指令]
- **高级功能**：参见 [`advanced.md`](advanced.md)
- **API 参考**：参见 [`reference.md`](reference.md)
- **示例**：参见 [`examples.md`](examples.md)
```

### 使用目录结构组织较长的参考文件

对于超过 100 行的参考文件，在顶部包含目录。这确保即使使用部分读取预览，Claude 也能看到可用信息的完整范围。

**示例**：

```markdown
# API 参考

## 目录
- 认证和设置
- 核心方法（创建、读取、更新、删除）
- 高级功能（批量操作、webhook）
- 错误处理模式
- 代码示例

## 认证和设置
...

## 核心方法
...
```

然后 Claude可以读取完整文件或根据需要跳转到特定部分。

有关这种基于文件系统的架构如何实现渐进式披露的详细信息，请参阅下面高级部分中的 [运行时环境](runtime-environment) 部分。

## 工作流和反馈循环

### 对复杂任务使用工作流

将复杂操作分解为清晰的连续步骤。对于特别复杂的工作流，提供一个检查清单，Claude 可以将其复制到响应中并在完成时勾选。

**示例 1：研究综合工作流**（适用于没有代码的 Skill）：

```markdown
## 研究综合工作流
复制此检查清单并跟踪你的进度：

```
研究进度：
- [ ] 步骤 1：阅读所有源文档
- [ ] 步骤 2：识别关键主题
- [ ] 步骤 3：交叉引用声明
- [ ] 步骤 4：创建结构化摘要
- [ ] 步骤 5：验证引用
```

**步骤 1：阅读所有源文档**
阅读 `sources/` 目录中的每个文档。注意主要论点和支持证据。

**步骤 2：识别关键主题**
查找跨来源的模式。哪些主题反复出现？来源在哪里同意或不同意？

**步骤 3：交叉引用声明**
对于每个主要声明，验证它出现在源材料中。注意哪个来源支持每个观点。

**步骤 4：创建结构化摘要**
按主题组织发现。包括：
- 主要声明
- 来自来源的支持证据
- 冲突观点（如有）

**步骤 5：验证引用**
检查每个声明是否引用了正确的源文档。如果引用不完整，返回步骤 3。
```

此示例展示了工作流如何应用于不需要代码的分析任务。检查清单模式适用于任何复杂的多步骤流程。

**示例 2：PDF 表单填写工作流**（适用于有代码的 Skill）：

```markdown
## PDF 表单填写工作流
复制此检查清单并在完成时勾选：

```
任务进度：
- [ ] 步骤 1：分析表单（运行 analyze_form.py）
- [ ] 步骤 2：创建字段映射（编辑 fields.json）
- [ ] 步骤 3：验证映射（运行 validate_fields.py）
- [ ] 步骤 4：填写表单（运行 fill_form.py）
- [ ] 步骤 5：验证输出（运行 verify_output.py）
```

**步骤 1：分析表单**
运行：`python scripts/analyze_form.py input.pdf`
这会提取表单字段及其位置，保存到 `fields.json`。

**步骤 2：创建字段映射**
编辑 `fields.json` 为每个字段添加值。

**步骤 3：验证映射**
运行：`python scripts/validate_fields.py fields.json`
在继续之前修复任何验证错误。

**步骤 4：填写表单**
运行：`python scripts/fill_form.py input.pdf fields.json output.pdf`

**步骤 5：验证输出**
运行：`python scripts/verify_output.py output.pdf`
如果验证失败，返回步骤 2。
```

清晰的步骤防止 Claude 跳过关键验证。检查清单帮助 Claude 和你跟踪多步骤工作流的进度。

### 实现反馈循环

**常见模式**：运行验证器 → 修复错误 → 重复

这种模式大大提高了输出质量。

**示例 1：风格指南合规**（适用于没有代码的 Skill）：

```markdown
## 内容审查流程
1. 按照 STYLE_GUIDE.md 中的指南起草你的内容
2. 根据检查清单审查：
   - 检查术语一致性
   - 验证示例遵循标准格式
   - 确认所有必需部分都存在
3. 如果发现问题：
   - 记录每个问题及具体部分引用
   - 修改内容
   - 再次审查检查清单
4. 只有在满足所有要求时才继续
5. 完成并保存文档
```

这展示了使用参考文档而非脚本的验证循环模式。"验证器"是 STYLE_GUIDE.md，Claude 通过阅读和比较执行检查。

**示例 2：文档编辑流程**（适用于有代码的 Skill）：

```markdown
## 文档编辑流程
1. 对 `word/document.xml` 进行编辑
2. **立即验证**：`python ooxml/scripts/validate.py unpacked_dir/`
3. 如果验证失败：
   - 仔细查看错误消息
   - 修复 XML 中的问题
   - 再次运行验证
4. **只有在验证通过时才继续**
5. 重建：`python ooxml/scripts/pack.py unpacked_dir/ output.docx`
6. 测试输出文档
```

验证循环及早捕获错误。

## 内容指南

### 避免时间敏感信息

不要包含会过时的信息：

**坏例子**：时间敏感（将会出错）
```markdown
如果你在 2025 年 8 月之前这样做，请使用旧 API。
2025 年 8 月之后，请使用新 API。
```

**好例子**（使用"旧模式"部分）：
```markdown
## 当前方法
使用 v2 API 端点：
```
api.example.com/v2/messages
```

## 旧模式
<details>
<summary>传统 v1 API（2025-08 已弃用）</summary>

v1 API 使用：
```
api.example.com/v1/messages
```

此端点不再支持。
</details>
```

旧模式部分提供历史背景，而不会弄乱主要内容。

### 使用一致的术语

选择一个术语并在整个 Skill 中使用：

**好 - 一致**：
- 始终使用"API 端点"
- 始终使用"字段"
- 始终使用"提取"

**坏 - 不一致**：
- 混用"API 端点"、"URL"、"API 路由"、"路径"
- 混用"字段"、"框"、"元素"、"控件"
- 混用"提取"、"拉取"、"获取"、"检索"

一致性帮助 Claude 理解和遵循指令。

## 常见模式

### 模板模式

为输出格式提供模板。根据你的需求匹配严格程度。

**对于严格要求**（如 API 响应或数据格式）：

```markdown
## 报告结构
始终使用此确切模板结构：

```markdown
# [分析标题]

## 执行摘要
[关键发现的单段概述]

## 关键发现
- 发现 1 及支持数据
- 发现 2 及支持数据
- 发现 3 及支持数据

## 建议
1. 具体的可操作建议
2. 具体的可操作建议
```
```

**对于灵活指导**（当适应有用时）：

```markdown
## 报告结构
这是一个合理的默认格式，但请根据分析情况运用你的最佳判断：

```markdown
# [分析标题]

## 执行摘要
[概述]

## 关键发现
[根据发现调整部分]

## 建议
[根据具体上下文定制]
```

根据具体分析类型调整部分。
```

### 示例模式

对于输出质量取决于看到示例的 Skill，提供输入/输出对，就像在常规提示中一样：

```markdown
## 提交消息格式
生成遵循这些示例的提交消息：

**示例 1：**
- 输入：使用 JWT 令牌添加用户认证
- 输出：
```
feat(auth): 实现基于 JWT 的身份认证
添加登录端点和令牌验证中间件
```

**示例 2：**
- 输入：修复了报告中日期显示不正确的错误
- 输出：
```
fix(reports): 纠正时区转换中的日期格式
在报告生成中一致地使用 UTC 时间戳
```

**示例 3：**
- 输入：更新依赖并重构错误处理
- 输出：
```
chore: 更新依赖并重构错误处理
- 升级 lodash 到 4.17.21
- 标准化端点间的错误响应格式
```

遵循这种风格：类型 (范围): 简短描述，然后是详细解释。
```

示例帮助 Claude 理解所需的风格和详细程度，比描述更清晰。

### 条件工作流模式

引导 Claude 完成决策点：

```markdown
## 文档修改工作流
1. 确定修改类型：
   - **创建新内容？** → 遵循下面的"创建工作流"
   - **编辑现有内容？** → 遵循下面的"编辑工作流"

2. 创建工作流：
   - 使用 docx-js 库
   - 从头构建文档
   - 导出为 .docx 格式

3. 编辑工作流：
   - 解包现有文档
   - 直接修改 XML
   - 每次更改后验证
   - 完成后重新打包
```

如果工作流变得庞大或复杂，考虑将它们推送到单独的文件中，并告诉 Claude 根据任务读取适当的文件。

## 评估和迭代

### 首先构建评估

在编写大量文档**之前**创建评估。这确保你的 Skill 解决实际问题，而不是记录想象的问题。

**评估驱动开发**：

1. **识别差距**：在没有 Skill 的情况下对代表性任务运行 Claude。记录具体的失败或缺失的上下文
2. **创建评估**：构建测试这些差距的三个场景
3. **建立基线**：测量 Claude 在没有 Skill 时的表现
4. **编写最小指令**：创建刚好足以解决差距并通过评估的内容
5. **迭代**：执行评估，与基线比较，并完善

这种方法确保你解决实际问题，而不是预测可能永远不会出现的需求。

**评估结构示例**：

```json
{
  "skills": ["pdf-processing"],
  "query": "从该 PDF 文件中提取所有文本并保存到 output.txt",
  "files": ["test-files/document.pdf"],
  "expected_behavior": [
    "使用适当的 PDF 处理库或命令行工具成功读取 PDF 文件",
    "从文档的所有页面提取文本内容，不遗漏任何页面",
    "将提取的文本以清晰可读的格式保存到名为 output.txt 的文件"
  ]
}
```

此示例演示了带有简单测试标准的数据驱动评估。目前没有运行这些评估的内置方法。用户可以创建自己的评估系统。

评估是衡量 Skill 有效性的真实来源。

### 与 Claude 迭代开发 Skill

最有效的 Skill 开发过程涉及 Claude 本身。与一个 Claude 实例（"Claude A"）合作创建一个将由其他实例（"Claude B"）使用的 Skill。

Claude A 帮助你设计和完善指令，而 Claude B 在实际任务中测试它们。

这有效是因为 Claude 模型都理解如何编写有效的代理指令以及代理需要什么信息。

**创建新 Skill**：

1. **在没有 Skill 的情况下完成任务**：使用正常提示与 Claude A 一起解决问题。在过程中，你会自然地识别出需要记录的模式和上下文
2. **记录失败**：注意 Claude 在哪里犯错或遗漏关键信息
3. **创建 Skill**：基于观察到的需求编写最小指令
4. **测试**：让 Claude B 使用新 Skill 执行相同任务
5. **迭代**：根据结果完善指令

这种协作方法比独自编写完整文档更高效。

---

*本文档基于 Claude API 文档的 Skill 创作最佳实践翻译。*
