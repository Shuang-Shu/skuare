# Skill Dependency File Format Specification

> [中文版 / Chinese Version](./skill_deps_format_zh.md)

> Document Type: TECH  
> Status: Completed  
> Last Updated: 2026-02-28  
> Scope: project-wide

## Objectives
- Define the authoritative format for `skill-deps.json` and `skill-deps.lock.json`.
- Constrain the field scope that the `build` command can write (including `alias`).

## Specification Priority
- The JSON Schema in this document is the authoritative specification.
- `examples/*/skill-deps.json` and `examples/*/skill-deps.lock.json` are only sample data and must comply with the Schema in this document, not define the specification inversely.

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

## build Command and Aliases
- Command format: `skuare build <skillName> [refSkill...]`
- Alias syntax: `<alias>=<refSkill>`
- Example: `skuare build report-generator normalizer=data-normalizer schema=schema-validator`
- Output rules:
  - If an alias is provided, write `alias` in `dependencies[]`.
  - If no alias is provided, only write `skill/version`.
