# Command Map

## Local Files
- `skr skill`: install the default Skuare skill template into the current directory.
- `skr build <skillName> [refSkill...] [--all]`: write `skill-deps.json` and `skill-deps.lock.json`.
- `skr format [skillDir...]` or `skr format --all`: normalize local `SKILL.md`.
- `skr detail <skillName|skillID> [relativePath...]`: inspect installed local skill files.

## Remote Read / Install
- `skr list [--q <keyword>] [--rgx <pattern>]`: search remote skills.
- `skr peek <skillRef> [version]`: inspect remote skill overview or exact version detail.
- `skr get <skillRef> [version] [--global] [--wrap] [--slink]`: install a remote skill into local tool directories.
- `skr deps --brief|--content|--tree|--install <rootSkillDir> ...`: inspect or install wrapped dependencies.

## Remote Write
- `skr publish --dir <skillDir>`: publish the current local skill directory.
- `skr update <skillRef> <newSkillDir>`: publish a greater version for an existing remote skill.
- `skr delete <skillID> <version>`: delete a remote skill version.

## Selection Notes
- `skillRef` supports `skillID`, `author/name`, `name`, and version-qualified forms such as `author/name@1.2.0`.
- `skr get --wrap` installs only the root skill and records wrap metadata for later `skr deps`.
- `skr get --slink` links installed targets to the local CLI repository skill directory instead of copying remote files.
- `--global` writes into each configured tool's global repository; omit it for workspace-local installation.
