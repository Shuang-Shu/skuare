# Skill 依赖规范

> 文档类型：TECH
> 状态：已完成
> 更新时间：2026-02-23
> 适用范围：project-wide

## 目标与范围

本规范定义 Skill 聚合模块的最小依赖描述格式，目标是：

1. 仅使用两个文件表达依赖声明与锁定结果。
2. 支持外部 Skill 引用、别名调用与版本管理。
3. 支持中央仓库拉取与本地覆盖，且保证可复现。

本规范适用于“一个模块引用多个小 Skill”的场景，不用于替代单个 Skill 的 `SKILL.md` 内容。

## 架构与 API 设计

### 文件模型

固定使用以下两个文件：

1. `skill-deps.json`：声明文件，描述模块信息、依赖与别名、版本约束、可选覆盖策略。
2. `skill-deps.lock.json`：锁定文件，记录解析后的精确版本、提交哈希与完整性摘要。

### `skill-deps.json` 结构

```json
{
  "module": "github.com/skaure/eng-drawing-approval-set",
  "version": "1.0.0",
  "entry": "SKILL.md",
  "deps": {
    "dxf": {
      "module": "github.com/skaure/dxf-reader",
      "version": "^2.1.0"
    },
    "engSpec": {
      "module": "github.com/skaure/eng-spec-reader",
      "version": "~1.4.2"
    },
    "forceCalc": {
      "module": "github.com/skaure/force-caculate",
      "version": ">=1.0.0 <2.0.0"
    }
  },
  "overrides": {
    "github.com/skaure/dxf-reader": {
      "module": "file:///opt/skills/dxf-reader",
      "version": "0.0.0-local"
    }
  }
}
```

字段约束：

1. `module`：当前聚合模块唯一标识，建议使用 `github.com/<org>/<name>`。
2. `version`：当前聚合模块版本，采用 semver。
3. `entry`：主流程文档路径，默认建议 `SKILL.md`。
4. `deps`：依赖集合，`key` 为别名，`value` 至少包含 `module` 与 `version`。
5. `overrides`：可选，本地开发或临时替代映射，不建议进入发布产物。

### `skill-deps.lock.json` 结构

```json
{
  "github.com/skaure/dxf-reader@2.1.3": {
    "commit": "abc123...",
    "sha256": "..."
  },
  "github.com/skaure/eng-spec-reader@1.4.6": {
    "commit": "def456...",
    "sha256": "..."
  },
  "github.com/skaure/force-caculate@1.2.1": {
    "commit": "789xyz...",
    "sha256": "..."
  }
}
```

字段约束：

1. key 格式为 `<module>@<resolvedVersion>`。
2. `commit` 为解析来源的精确提交标识。
3. `sha256` 为下载内容摘要，用于完整性校验。

### 文档中别名引用约定

`SKILL.md` 中通过别名调用依赖 Skill：

```md
1. 使用 {{skill:dxf.read_drawing}} 读取图纸
2. 使用 {{skill:engSpec.read_spec}} 读取工程规范
3. 使用 {{skill:forceCalc.calculate_force}} 执行力学计算
```

其中 `dxf`、`engSpec`、`forceCalc` 必须与 `skill-deps.json` 的 `deps` 键一致。

## 分阶段实施步骤

1. 定义模块：创建 `skill-deps.json`，写入 `module`、`version`、`entry`。
2. 声明依赖：在 `deps` 中定义依赖别名与版本范围。
3. 编写流程：在 `SKILL.md` 使用 `{{skill:<alias>.<action>}}` 引用依赖能力。
4. 解析依赖：安装器按 `deps` 版本范围解析并拉取中央仓库依赖。
5. 生成锁定：写入 `skill-deps.lock.json`，记录精确版本与摘要。
6. 执行校验：校验文档引用别名均可在 `deps` 找到，且 lock 与安装结果一致。

## 验收标准与风险

验收标准：

1. 任意聚合模块只需 `skill-deps.json` 与 `skill-deps.lock.json` 两个依赖文件。
2. 依赖别名可在 `SKILL.md` 中稳定引用，且能映射到真实外部 Skill。
3. 同一提交下重复安装得到一致依赖版本与内容摘要。

风险与控制：

1. 风险：版本范围过宽导致行为变化。
控制：CI 强制提交并校验 `skill-deps.lock.json`。
2. 风险：别名拼写错误导致运行期失败。
控制：增加静态校验，检查 `SKILL.md` 的别名引用与 `deps` 一致性。
3. 风险：中央仓库包被篡改。
控制：安装时按 lock 中 `sha256` 强校验，不通过即失败。
