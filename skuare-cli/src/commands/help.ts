/**
 * 帮助命令
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";

export class HelpCommand extends BaseCommand {
  readonly name = "help";
  readonly description = "Show help";

  async execute(): Promise<void> {
    printHelp();
  }
}

/**
 * 版本命令
 */
export class VersionCommand extends BaseCommand {
  readonly name = "version";
  readonly description = "Show version";

  async execute(): Promise<void> {
    console.log("skuare v0.1.0");
  }
}

function printHelp(): void {
  console.log(`skuare

Usage:
  skuare [global flags] <command>
  skr [global flags] <command>

Commands:
  help                                 Show help
  version                              Show version
  init                                 Interactive init for global/workspace config
  health                               Health check (GET /healthz)
  list [--q <keyword>] [--regex <re>]  List skills (GET /api/v1/skills)
  peek <skillID> [version]             Peek skill overview/detail
  peek --regex <re> [version]          Peek by regex (must match exactly one skill)
  get <skillID> [version] [--scope global|workspace] [--repo-dir <path>] [--tool <name>]
                                       Install skill to local partial repository
  validate <skillID> <version>         Validate a version
  publish --file <request.json>        Publish from request JSON
  publish --skill <SKILL.md> [--skill-id <id>] [--version <v>]
                                       Explicit SKILL.md mode, version from frontmatter metadata.version
  publish --dir <skillDir> [--skill-id <id>] [--version <v>]
                                       Explicit dir mode, version from <dir>/SKILL.md frontmatter metadata.version
  publish <path...> [--all] [--skill-id <id>] [--version <v>]
                                       Auto detect each path: SKILL.md -> dir -> JSON fallback
  create ...                           Deprecated alias of publish
  build <skillName> [refSkill...]      Build skill-deps files, supports alias=refSkill
  delete <skillID> <version>           Delete skill version
  format [skillDir...]                 Interactive format for metadata.version/metadata.author
  format --all                         Format all skill dirs under current directory

Global Flags:
  --server <url>                       Backend URL (highest priority)
  --key-id <id>                        Signing key id for write operations
  --privkey-file <path>                Ed25519 private key PEM file

Config Precedence:
  CLI flags > workspace config > global config > defaults

Write Operations:
  publish / create / delete            Backend write, non-local mode requires --key-id and --privkey-file
  build                                Local dependency file write, no backend request

Examples:
  skr health
  skr list --q pdf
  skr list --regex "report|alert"
  skr peek pdf-reader 1.0.0
  skr peek --regex "^skuare/report-generator@"
  skr get pdf-reader --scope workspace
  skr get pdf-reader --scope global --repo-dir ~/.skuare
  skr publish --file /tmp/create-skill.json
  skr publish --skill ./skills/pdf-reader/SKILL.md
  skr publish --dir ./skills/pdf-reader
  skr publish ./skills/pdf-reader
  skr create ./skills/pdf-reader
  skr build report-generator data-normalizer schema-validator
  skr build report-generator normalizer=data-normalizer schema=schema-validator`);
}
