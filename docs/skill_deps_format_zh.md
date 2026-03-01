# Skill 依赖文件格式规范

> 文档类型：TECH
> 状态：已完成
> 更新时间：2026-02-28
> 适用范围：project-wide

## 目标
- 定义 `skill-deps.json` 与 `skill-deps.lock.json` 的权威格式。
- 约束 `build` 命令可写入的字段范围（含别名 `alias`）。

## 规范优先级
- 本文中的 JSON Schema 是权威规范。
- `examples/*/skill-deps.json` 与 `examples/*/skill-deps.lock.json` 只是示例数据，必须遵循本文 Schema，而不是反向定义规范。

## skill-deps.json Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://skuare.dev/schema/skill-deps.json",
  "title": "skill-deps.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["dependencies"],
  "properties": {
    "dependencies": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["skill", "version"],
        "properties": {
          "skill": {
            "type": "string",
            "minLength": 1
          },
          "version": {
            "type": "string",
            "minLength": 1
          },
          "alias": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9._-]+$"
          }
        }
      }
    }
  }
}
```

## skill-deps.lock.json Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://skuare.dev/schema/skill-deps.lock.json",
  "title": "skill-deps.lock.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["lock_version", "dependencies"],
  "properties": {
    "lock_version": {
      "type": "integer",
      "const": 1
    },
    "dependencies": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["skill", "version", "resolved"],
        "properties": {
          "skill": {
            "type": "string",
            "minLength": 1
          },
          "version": {
            "type": "string",
            "minLength": 1
          },
          "resolved": {
            "type": "string",
            "minLength": 1
          },
          "alias": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9._-]+$"
          }
        }
      }
    }
  }
}
```

## build 命令与别名
- 命令格式：`skuare build <skillName> [refSkill...]`
- 别名语法：`<alias>=<refSkill>`
- 示例：`skuare build report-generator normalizer=data-normalizer schema=schema-validator`
- 输出规则：
  - 若传入别名，`dependencies[]` 中写入 `alias`。
  - 若未传别名，则仅写入 `skill/version`。
