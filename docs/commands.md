# skuare Command Reference

> [中文版 / Chinese Version](./commands_zh.md)

> Document Type: REFERENCE  
> Status: Completed  
> Last Updated: 2026-03-10  
> Scope: project-wide

## Example Setup

All command examples in this document are backed by the repository's `examples/` directory.

- Pure local commands operate directly on `./examples/`.
- Remote-related commands (`list`, `peek`, `get`, `validate`, `delete`) assume a local `skuare-svc` is already running, then use:

```bash
skr publish --dir ./examples/observability-orchestrator
```

That single publish command recursively uploads `observability-orchestrator` and its dependency chain, which becomes the fixture set for the remote examples below.

- To test `update`, reuse that published remote sample together with the local example directory:

```bash
skr update ShuangShu/observability-orchestrator ./examples/observability-orchestrator
```

- To test `publish --file`, use the bundled request payload:

```bash
skr publish --file ./examples/requests/publish-pdf-reader.json
```

- To test multi-file `detail`, install the sample once:

```bash
skr get observability-orchestrator
```

Then read the bundled `references/details.md` and `notes.txt` files from that installed skill.

## Command Categories

### Pure Local Commands
Do not access server by default. Operate on local files and configuration.

- `help` - Show help information
- `version` - Show version information
- `init` - Initialize configuration
- `build` - Build dependency files
- `format` - Format skill metadata
- `detail` - Show local skill file contents

### Server Read-Only Commands
Access server but do not write to remote repository.

- `health` - Health check
- `list` - List skills
- `peek` - Peek skill details
- `validate` - Validate skill version

### Hybrid Commands
Access server and write to local repository.

- `get` - Install skill and dependencies

### Server Write Commands
Write to remote repository. May require authentication in remote mode.

- `publish` - Publish skill with dependencies
- `update` - Publish a higher version for an existing remote skill
- `create` - Deprecated alias of publish
- `delete` - Delete skill version

---

## Command Details

### help
Show help information for all commands.

**Usage:**
```bash
skr help
```

**Output:**
Displays usage patterns for all available commands.

---

### version
Show skuare CLI version.

**Usage:**
```bash
skr version
```

**Output:**
Displays version number from package.json.

---

### init
Interactive initialization for global or workspace configuration.

**Usage:**
```bash
skr init
```

**Behavior:**
- Prompts for configuration scope (global or workspace)
- Configures remote server address and port
- Configures authentication credentials
- Selects LLM tools (codex, claudecode, or custom)
- Configures custom tool skills directories

**Configuration Files:**
- Global: `~/.skuare/config.json`
- Workspace: `<cwd>/.skuare/config.json`

**Configuration Priority:**
CLI args > workspace config > global config > defaults

---

### health
Health check for remote server.

**Usage:**
```bash
skr health
```

**Behavior:**
Sends GET request to `/healthz` endpoint.

**Output:**
Success or error message with HTTP status.

---

### list
List all skills in remote repository.

**Usage:**
```bash
skr list
skr list --q <keyword>
skr list --rgx <pattern>
```

**Options:**
- `--q <keyword>` - Filter by keyword (case-insensitive substring match)
- `--rgx <pattern>` - Filter by regex pattern (matches id/skill_id/name/author/description)

**Output:**
JSON array of skills with fields:
- `id` - Display identifier `<author>/<name>@<version>`
- `name` - Skill name
- `author` - Skill author
- `skill_id` - Internal skill ID
- `version` - Skill version
- `description` - Skill description

**Examples:**
```bash
skr list --q observability
skr list --rgx "^ShuangShu/.*@0\.0\.1$"
```

---

### peek
Peek skill overview or detailed version information.

**Usage:**
```bash
skr peek <skillRef> [version]
skr peek --rgx <pattern> [version]
```

**Options:**
- `--rgx <pattern>` - Match skill by regex (must match exactly one skill)

**Behavior:**
- Without version: shows all versions of the skill
- With version: shows detailed file list for that version
- `skillRef` accepts `skillID`, `name`, and `author/name`

**Output:**
JSON with skill metadata and file information.

**Examples:**
```bash
skr peek observability-orchestrator
skr peek observability-orchestrator 0.0.1
skr peek ShuangShu/report-generator 0.0.1
skr peek --rgx "^ShuangShu/report-generator@"
```

---

### get
Install skill and its dependencies to local partial repository.

**Usage:**
```bash
skr get <skillRef> [version] [--global]
skr get --rgx <pattern> [version] [--global]
```

**Options:**
- `--rgx <pattern>` - Match skill by regex (must match exactly one skill)
- `--global` - Install to global directory instead of workspace

**Installation Directories:**
- Workspace (default): `<cwd>/.<tool>/skills/<skillID>/`
- Global: `~/.skuare/.<tool>/skills/<skillID>/`

Where `<tool>` is the first configured LLM tool (codex/claudecode/custom).

**Behavior:**
- Fetches skill from remote repository
- Resolves dependency tree from `skill-deps.lock.json`
- Installs all dependencies as sibling directories (flat structure)
- Uses latest version if version not specified
- `skillRef` accepts `skillID`, `name`, and `author/name`

**Output:**
JSON with installation summary:
- `global` - Installation scope
- `llm_tool` - Target tool
- `target` - Installation root directory
- `skills` - List of installed skill IDs
- `conflicts` - List of overwritten files (if any)

**Examples:**
```bash
skr get observability-orchestrator
skr get observability-orchestrator 0.0.1
skr get ShuangShu/observability-orchestrator 0.0.1
skr get observability-orchestrator --global
skr get --rgx "observability"
```

---

### detail
Show file contents from locally installed skill.

**Usage:**
```bash
skr detail <skillName|skillID> [relativePath...]
```

**Behavior:**
- Resolves skill from local installation directory
- Defaults to `SKILL.md` if no path specified
- Supports multiple relative paths
- Rejects paths outside skill directory

**Resolution Order:**
1. Search in `<cwd>/.<tool>/skills/`
2. Search in `~/.skuare/.<tool>/skills/`

**Output:**
File contents with path headers.

**Examples:**
```bash
skr detail observability-orchestrator
skr detail observability-orchestrator SKILL.md
skr detail observability-orchestrator references/details.md notes.txt
```

---

### validate
Validate a specific skill version on remote server.

**Usage:**
```bash
skr validate <skillID> <version>
```

**Behavior:**
Triggers server-side validation for the specified version.

**Output:**
Validation result from server.

**Example:**
```bash
skr validate observability-orchestrator 0.0.1
```

---

### build
Build or update dependency files for a local skill.

**Usage:**
```bash
skr build <skillName> [refSkill...]
skr build <skillName> [alias=refSkill...]
skr build <skillName> --all
```

**Options:**
- `--all` - Use all valid skill directories in current directory as reference skills

**Behavior:**
- Creates `skill-deps.json` and `skill-deps.lock.json` if missing
- Appends new dependencies to existing files
- Supports alias syntax: `alias=refSkill`
- Prompts to create minimal `SKILL.md` if target skill doesn't exist
- Scans current directory for skill directories

**Examples:**
```bash
cd ./examples
skr build observability-orchestrator api-ingest-pipeline report-generator
skr build report-generator validator=schema-validator
skr build observability-orchestrator --all
```

---

### format
Format skill metadata in SKILL.md frontmatter.

**Usage:**
```bash
skr format [skillDir...]
skr format --all
```

**Options:**
- `--all` - Format all skill directories under current directory

**Behavior:**
- Interactive mode: prompts for each skill or batch operation
- Normalizes `metadata.version` and `metadata.author` fields
- Preserves other frontmatter content

**Examples:**
```bash
skr format ./examples/observability-orchestrator
skr format ./examples/report-generator ./examples/schema-validator
cd ./examples && skr format --all
```

---

### publish
Publish skill with recursive dependency upload.

**Usage:**
```bash
skr publish --file <request.json>
skr publish --skill <SKILL.md> [--skill-id <id>] [--version <v>]
skr publish --dir <skillDir> [--skill-id <id>] [--version <v>]
skr publish <path...> [--all] [--skill-id <id>] [--version <v>]
```

**Modes:**
1. **JSON mode**: `--file <request.json>` - Publish from request JSON
2. **Explicit SKILL.md mode**: `--skill <SKILL.md>` - Version from frontmatter
3. **Explicit dir mode**: `--dir <skillDir>` - Version from `<dir>/SKILL.md` frontmatter
4. **Auto-detect mode**: `<path...>` - Detects SKILL.md, directory, or JSON

**Options:**
- `--all` - Auto-detect and publish all paths
- `--skill-id <id>` - Override skill ID
- `--version <v>` - Override version
- `--key-id <id>` - Signing key ID (for authentication)
- `--privkey-file <path>` - Private key file (for authentication)

**Behavior:**
- Reads `skill-deps.json` from skill directory
- Recursively resolves and uploads all dependencies
- Returns `WARN` for versions already in remote repository
- Requires authentication in remote mode (unless server allows unsigned writes)

**Examples:**
```bash
skr publish --file ./examples/requests/publish-pdf-reader.json
skr publish --dir ./examples/observability-orchestrator
skr publish --skill ./examples/observability-orchestrator/SKILL.md
skr publish ./examples/pdf-reader ./examples/api-debugger --all
```

---

### update
Publish a higher new version for an existing remote skill.

**Usage:**
```bash
skr update <author>/<skillName> <newSkillDir>
```

**Behavior:**
- Queries the remote skill's existing versions.
- Computes the remote `maxVersion` and only allows a strictly greater new version.
- In interactive mode, shows a suggested version greater than `maxVersion` as the default value.
- Writes the chosen version back to `<newSkillDir>/SKILL.md` as `metadata.version`.
- Then reuses the existing `publish --dir` flow to upload that directory and its dependencies.

**Limits:**
- Currently supports Skill only, not `agentsmd/agmd`.
- Local `SKILL.md` `name` and `metadata.author` must match the command arguments.
- In non-interactive mode, the command fails when local `metadata.version` is not greater than remote `maxVersion`.

**Example:**
```bash
skr update ShuangShu/observability-orchestrator ./examples/observability-orchestrator
```

---

### create
Deprecated alias of `publish` command.

**Usage:**
```bash
skr create ...
```

**Behavior:**
Forwards to `publish` command with deprecation warning.

**Recommendation:**
Use `skr publish` instead.

**Reproducible example:**
```bash
skr create --dir ./examples/pdf-reader
```

---

### delete
Delete a specific skill version from remote repository.

**Usage:**
```bash
skr delete <skillID> <version>
```

**Behavior:**
Sends DELETE request to remove the specified version.

**Authentication:**
Requires authentication in remote mode.

**Example:**
```bash
skr delete observability-orchestrator 0.0.1
```

---

## Authentication

### Signing Credentials
Write commands (`publish`, `delete`) may require Ed25519 signatures in remote mode.

**Configuration:**
- `auth.keyId` - Key identifier
- `auth.privateKeyFile` - Path to private key file

**CLI Override:**
```bash
skr publish --dir ./skills/my-skill --key-id <id> --privkey-file <path>
```

### Local Mode
When server runs with `--local` flag, unsigned writes are allowed.

---

## Configuration

### Configuration Files
- Global: `~/.skuare/config.json`
- Workspace: `<cwd>/.skuare/config.json`

### Configuration Schema
```json
{
  "remote": {
    "mode": "local | remote",
    "address": "localhost",
    "port": 8080
  },
  "auth": {
    "keyId": "optional-key-id",
    "privateKeyFile": "optional-path-to-key"
  },
  "llmTools": ["codex", "claudecode"],
  "toolSkillDirs": {
    "custom-tool": "/path/to/skills"
  }
}
```

### Priority
CLI arguments > workspace config > global config > defaults

---

## Related Documentation
- Project README: `README.md`
- Technical Summary: `docs/tech_summary.md`
- Roadmap: `docs/roadmap.md`
- Dependency Format: `docs/skill_deps_format.md`
- Storage Hierarchy: `docs/storage_hierarchy.md`
- Skill Reference: `docs/skill_reference.md`
- Example skill directory: `examples/`
