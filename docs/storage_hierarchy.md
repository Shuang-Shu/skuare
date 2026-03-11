# skuare Tiered Storage Mechanism

> [中文版 / Chinese Version](./storage_hierarchy_zh.md)

> Document Type: TECH  
> Status: Completed  
> Last Updated: 2026-03-11  
> Scope: project-wide

## Objectives and Scope
- Explain `skuare`'s current "tiered storage mechanism" actual implementation, not historical concepts or outdated configurations.
- Separately describe three easily confused tiers:
  - Server-side remote repository tier
  - CLI configuration tier
  - CLI local installation tier
- Supplement main data flows for `publish` / `get`, clarify boundaries and common misconceptions.

## One-Sentence Summary
- Where server stores: determined only by `skuare-svc` startup parameters.
- How CLI connects to server: jointly determined by CLI args, workspace config, global config, and defaults.
- Where CLI installs skills locally: determined by current `cwd`, target `tool`, and `--global`.
- CLI no longer maintains or infers server's actual storage directory.

## 1. Server-Side Remote Repository Tier

### 1.1 Repository Root Directory
- `skuare-svc` parses remote repository root directory `SpecDir` at startup.
- Default value is `$HOME/.skuare/skills`.
- Can be overridden by environment variable `SKUARE_SPEC_DIR` or startup parameter `--spec-dir`.
- Related implementation: `skuare-svc/internal/config/config.go`.

### 1.2 Directory Structure
Actual file structure under remote repository root directory:

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

- `<authorDir>/<skillID>/<version>/` is the actual storage directory for skill versions.
- Missing `metadata.author` falls back to `_anonymous` for filesystem placement.
- `.skuare/index.json` is the server-side index file.
- `.skuare/locks/` stores file locks by `skillID` dimension.
- Related implementation: `skuare-svc/internal/store/fs_store.go`.

### 1.3 Server Write Behavior
- `publish/create` ultimately writes to `<specDir>/<authorDir>/<skillID>/<version>/`.
- When creating versions, first writes to temporary directory, then renames to official directory, reducing half-written state exposure risk.
- `delete` removes a specific `<authorDir>/<skillID>/<version>` directory and cleans empty parent directories on the way back up.
- `list/get/peek/validate` all read from this remote repository.
- If files are manually migrated on disk, run `POST /api/v1/reindex` once so the server rebuilds `.skuare/index.json`.

## 2. CLI Configuration Tier

### 2.1 Configuration File Locations
CLI has two local configuration layers:

- global config: `~/.skuare/config.json`
- workspace config: `<cwd>/.skuare/config.json`

Here `cwd` is the current directory when executing `skuare` / `skr` commands.

### 2.2 Configuration Merge Priority
CLI final configuration priority:

```text
CLI flags > workspace config > global config > defaults
```

Meaning:
- Command-line arguments have highest priority, e.g., `--server`, `--key-id`, `--privkey-file`.
- Without command-line override, prioritize workspace config.
- When workspace is missing, fall back to global config.
- Finally use built-in defaults.

### 2.3 Current Configuration Content
Current CLI default configuration mainly includes:

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

Explanation:
- `remote.mode` only indicates "target server mode awareness", not client local repository storage mode.
- `remote.address + remote.port` used to construct default server URL.
- `auth.*` are default values for write request signing credentials.
- `llmTools` and `toolSkillDirs` used for local tool directory selection.

### 2.4 About `remote.storageDir`
- This field was incorrectly exposed in CLI initialization flow.
- In current implementation, `skr init` no longer displays, edits, or writes `remote.storageDir` by default.
- Server-side remote repository root directory is determined only by server startup parameters, CLI no longer declares this value.
- If this field remains in historical configs, current CLI no longer depends on it to infer server directory.

## 3. CLI Local Installation Tier

### 3.1 Tool Home Root
When CLI fetches skills locally, it writes into the selected tool's home directory:

- workspace tool home (default): `<cwd>/.<tool>`
- global tool home: `~/.<tool>`

By default:
- `skr get` installs into the workspace tool home
- `--global` switches installation to the user's home directory
- The target `tool` set covers every configured LLM tool

### 3.2 Final Installation Directory
`skr get` final installation target is:

```text
<toolHome>/skills/<skillID>/
```

For example:

```text
<project>/.codex/skills/pdf-reader/
~/.codex/skills/pdf-reader/
```

These two tiers represent:
- `toolHome`: tool-specific local root
- `skillID`: specific skill ID

### 3.3 Why Still Separate by `tool`
The same machine may serve multiple LLM tools simultaneously, so local installation still needs to tier by `tool` to avoid installation result pollution between different tools.

## 4. tool Directory Tier

CLI maintains the concept of a "tool's own home directory", and `skr get` installs under that directory's `skills/` subdirectory.

Default rules:
- `codex` -> `<cwd>/.codex/skills`
- `claudecode` -> `<cwd>/.claudecode/skills`
- custom tool -> `<cwd>/.<tool>/skills`

If `toolSkillDirs[tool]` is provided in config, prioritize explicit config value.

This line's purpose is to tell CLI where a tool defaults to read or place local skill working directory. For current `get`, this is also the installation root family, unlike the earlier `repos/<scope>/<tool>` model which has been removed.

## 5. Main Data Flows

### 5.1 `skr publish`
`skr publish` core path:

```text
local skill directory / SKILL.md / request.json
  -> CLI parse and package
  -> HTTP write request
  -> skuare-svc
  -> <specDir>/<authorDir>/<skillID>/<version>/
```

Key points:
- CLI responsible for reading local files, constructing requests, attaching signatures as needed.
- Server responsible for final authentication, persistence, and index maintenance.
- Actual target directory for writes exists only on server side.

### 5.2 `skr get`
`skr get` core path:

```text
skuare-svc remote version files
  -> CLI fetch files
  -> parse dependencies
  -> write to <toolHome>/skills/<skillID>/
```

Key points:
- `get` writes to CLI local installation directory, not server-side remote repository.
- If skill has dependencies, CLI continues to recursively download dependencies and write them locally together.
- Current implementation no longer guesses whether server shares same directory with local based on client config.

## 6. Boundaries and Common Misconceptions

### 6.1 Common Misconception 1: CLI Config Determines Server Storage Directory
False.

Actual rule:
- CLI only determines "where to connect" and "how to organize local config/install directories".
- Server storage directory is determined only by `skuare-svc --spec-dir` or `SKUARE_SPEC_DIR`.

### 6.2 Common Misconception 2: `--global` Means Server Global Storage
Incomplete.

`--global` only affects the CLI local installation target:
- without `--global`: `<cwd>/.<tool>/skills/`
- with `--global`: `~/.<tool>/skills/`

But it doesn't affect server-side remote repository root directory.

### 6.3 Common Misconception 3: tool Directory and Installed Skill Directory Are the Same Thing
False.

They solve different problems:
- `toolSkillDirs`: tool's own skill working directory
- `<toolHome>/skills/<skillID>/...`: installed local skill directory after `skr get`

### 6.4 Common Misconception 4: local Mode Equals Client Local Write Mode
False.

`remote.mode=local` indicates target server is in local mode, whether to allow unsigned write requests is still determined by server.
It doesn't mean CLI itself has some "local shared server repository" privileged directory.

## 7. Current Implementation References
- CLI config and path resolution: `skuare-cli/src/config/resolver.ts`
- CLI config structure: `skuare-cli/src/types/index.ts`
- CLI local installation path: `skuare-cli/src/commands/query.ts`
- Server startup config: `skuare-svc/internal/config/config.go`
- Server filesystem storage: `skuare-svc/internal/store/fs_store.go`

## 8. Maintenance Recommendations
- If adding server capability discovery endpoint in the future, should synchronize "server runtime parameter summary" with this document.
- If adjusting `get`'s local directory structure in the future, should update sections 3 and 5 of this document simultaneously.
- If reintroducing any server directory related fields, must first clarify whether it's "server fact echo" or "client config declaration", cannot mix.
