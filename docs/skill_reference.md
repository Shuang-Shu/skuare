# Skill Reference Capability

> [中文版 / Chinese Version](./skill_reference_zh.md)

> Document Type: TECH  
> Status: Completed  
> Last Updated: 2026-03-07  
> Scope: project-wide

## Objectives
- Define how Skills reference other Skills in skuare.
- Clarify the relationship between dependency declaration and in-content references.
- Provide best practices for cross-skill references.

## Reference Mechanisms

### 1. Dependency Declaration
Dependencies are declared in `skill-deps.json` and locked in `skill-deps.lock.json`, not in `SKILL.md` frontmatter.

**File: skill-deps.json**
```json
{
  "dependencies": [
    { "skill": "data-normalizer", "version": "1.0.0" },
    { "skill": "schema-validator", "version": "1.0.0", "alias": "validator" }
  ]
}
```

**Purpose:**
- Declare runtime dependencies for the skill.
- Enable recursive dependency resolution during `skr publish`.
- Enable flat dependency installation during `skr get`.

**Key Fields:**
- `skill`: Skill name (required).
- `version`: Semantic version (required).
- `alias`: Optional short name for referencing in content.

For complete schema, see: `docs/skill_deps_format.md`.

### 2. In-Content References
Cross-skill references in `SKILL.md` body use the unified format:

```
{{ <author>/<name>@<version> }}
```

**Examples:**
```markdown
## Workflow
1. Trigger {{ ShuangShu/api-ingest-pipeline@1.0.0 }} to collect data.
2. Use {{ ShuangShu/data-normalizer@1.0.0 }} to clean records.
3. Apply {{ ShuangShu/schema-validator@1.0.0 }} for validation.
```

**Purpose:**
- Provide explicit, version-pinned references in documentation.
- Enable tooling to parse and validate cross-skill links.
- Maintain traceability across skill versions.

**Format Rules:**
- Must include `author`, `name`, and `version`.
- Use `/` to separate author and name.
- Use `@` to separate name and version.
- Whitespace inside `{{ }}` is allowed but not required.

### 3. Alias Usage
When a dependency declares an `alias`, you can use it as a shorthand in content:

**skill-deps.json:**
```json
{
  "dependencies": [
    { "skill": "schema-validator", "version": "1.0.0", "alias": "validator" }
  ]
}
```

**SKILL.md:**
```markdown
Apply {{ validator }} to check data integrity.
```

**Notes:**
- Aliases are local to the skill and do not propagate.
- Tooling should resolve aliases to full references during processing.
- Aliases must match pattern `^[A-Za-z0-9._-]+$`.

## Workflow Integration

### Building Dependencies
Use `skr build` to create or update dependency files:

```bash
# Add specific dependencies
skr build observability-orchestrator api-ingest-pipeline report-generator

# Add all skills in current directory
skr build observability-orchestrator --all

# Add dependency with alias
skr build report-generator validator=schema-validator
```

**Behavior:**
- Creates `skill-deps.json` and `skill-deps.lock.json` if missing.
- Appends new dependencies to existing files.
- Prompts to create minimal `SKILL.md` if target skill doesn't exist.

### Publishing with Dependencies
`skr publish` recursively uploads dependencies:

```bash
skr publish --dir ./skills/observability-orchestrator
```

**Behavior:**
- Reads `skill-deps.json` from the skill directory.
- Recursively resolves and uploads all dependencies.
- Returns `WARN` for versions already in remote repository.

### Installing with Dependencies
`skr get` fetches a skill and flatly installs its dependencies:

```bash
# Install to workspace (./<tool>/skills/)
skr get observability-orchestrator

# Install to global (~/.skuare/<tool>/skills/)
skr get observability-orchestrator --global
```

**Behavior:**
- Fetches the target skill from remote repository.
- Resolves dependency tree from `skill-deps.lock.json`.
- Installs all dependencies as sibling directories (flat structure).

**Example Result:**
```
.codex/skills/
├── observability-orchestrator/
├── api-ingest-pipeline/
├── report-generator/
└── alert-router/
```

## Best Practices

### 1. Version Pinning
Always specify exact versions in `skill-deps.json`:
```json
{ "skill": "core-time-utils", "version": "1.0.0" }
```

Avoid version ranges or wildcards to ensure reproducibility.

### 2. Minimal Dependencies
Only declare direct dependencies. Transitive dependencies are resolved automatically.

**Example:**
If `report-generator` depends on `data-normalizer`, and `observability-orchestrator` depends on `report-generator`, then `observability-orchestrator` should NOT directly declare `data-normalizer`.

### 3. Explicit References
Use full references in critical documentation sections:
```markdown
{{ ShuangShu/schema-validator@1.0.0 }}
```

Use aliases for frequently mentioned dependencies in implementation details.

### 4. Dependency Hygiene
- Run `skr format` to normalize `skill-deps.json` structure.
- Commit `skill-deps.lock.json` to ensure reproducible installations.
- Review dependency changes during code review.

## Reference Resolution

### Local Development
During local development, references are informational. Tooling may:
- Validate that referenced skills exist in `skill-deps.json`.
- Check version consistency across references.
- Generate dependency graphs.

### Runtime Behavior
At runtime (when LLM loads skills), the system:
- Reads `skill-deps.lock.json` to determine exact versions.
- Loads dependencies from local installation directory.
- Resolves aliases to full skill identifiers.

## Limitations and Future Work

### Current Limitations
- No automatic alias resolution in `SKILL.md` content.
- No validation that in-content references match declared dependencies.
- No circular dependency detection.

### Planned Enhancements
- `skr validate` to check reference consistency.
- Dependency graph visualization.
- Automatic alias expansion during `skr publish`.

## Related Documentation
- Dependency file format: `docs/skill_deps_format.md`
- Storage hierarchy: `docs/storage_hierarchy.md`
- Technical summary: `docs/tech_summary.md`
