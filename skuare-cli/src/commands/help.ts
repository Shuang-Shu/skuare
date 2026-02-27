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
  get <skillID> [version]              Install skill to local llm tool directory
  validate <skillID> <version>         Validate a version
  create --file <request.json>         Create from request JSON
  create --skill <SKILL.md> [--skill-id <id>] [--version <v>]
                                       Explicit SKILL.md mode, version from frontmatter metadata.version
  create --dir <skillDir> [--skill-id <id>] [--version <v>]
                                       Explicit dir mode, version from <dir>/SKILL.md frontmatter metadata.version
  create <path...> [--all] [--skill-id <id>] [--version <v>]
                                       Auto detect each path: SKILL.md -> dir -> JSON fallback
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
  create / delete                      Backend write, non-local mode requires --key-id and --privkey-file
  build                                Local dependency file write, no backend request

Examples:
  skr health
  skr list --q pdf
  skr list --regex "report|alert"
  skr peek pdf-reader 1.0.0
  skr peek --regex "^skuare/report-generator@"
  skr get pdf-reader
  skr create --file /tmp/create-skill.json
  skr create --skill ./skills/pdf-reader/SKILL.md
  skr create --dir ./skills/pdf-reader
  skr create ./skills/pdf-reader
  skr create /tmp/create-skill.json
  skr build report-generator data-normalizer schema-validator
  skr build report-generator normalizer=data-normalizer schema=schema-validator`);
}
