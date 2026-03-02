import type { Command } from "./types";
import { HealthCommand } from "./admin";
import { InitCommand } from "./init";
import { DetailCommand, GetCommand, ListCommand, PeekCommand, ValidateCommand } from "./query";
import { BuildCommand, CreateCommand, DeleteCommand, FormatCommand, PublishCommand } from "./write";

export type HelpEntry = {
  usage: string[];
  details?: string[];
};

export type CommandDefinition = {
  create: () => Command;
  help: HelpEntry;
};

export const STATIC_HELP_ENTRIES: HelpEntry[] = [
  { usage: ["help", "Show help"] },
  { usage: ["version", "Show version"] },
];

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    create: () => new InitCommand(),
    help: { usage: ["init", "Interactive init for global/workspace config"] },
  },
  {
    create: () => new HealthCommand(),
    help: { usage: ["health", "Health check (GET /healthz)"] },
  },
  {
    create: () => new DetailCommand(),
    help: { usage: ["detail [skillRelativePath...]", "Show local skill file contents"] },
  },
  {
    create: () => new ListCommand(),
    help: { usage: ["list [--q <keyword>] [--rgx <re>]", "List skills (GET /api/v1/skills)"] },
  },
  {
    create: () => new PeekCommand(),
    help: {
      usage: ["peek <skillID> [version]", "Peek skill overview/detail"],
      details: ["peek --rgx <re> [version]            Peek by regex (must match exactly one skill)"],
    },
  },
  {
    create: () => new GetCommand(),
    help: {
      usage: ["get <skillID> [version] [--rgx <re>] [--global]", ""],
      details: [
        "                                       Install skill and dependencies (default: <cwd>/.{tool}/skills/, --global: ~/.{tool}/skills/)",
      ],
    },
  },
  {
    create: () => new ValidateCommand(),
    help: { usage: ["validate <skillID> <version>", "Validate a version"] },
  },
  {
    create: () => new PublishCommand(),
    help: {
      usage: ["publish --file <request.json>", "Publish from request JSON"],
      details: [
        "publish --skill <SKILL.md> [--skill-id <id>] [--version <v>]",
        "                                       Explicit SKILL.md mode, version from frontmatter metadata.version",
        "publish --dir <skillDir> [--skill-id <id>] [--version <v>]",
        "                                       Explicit dir mode, version from <dir>/SKILL.md frontmatter metadata.version",
        "publish <path...> [--all] [--skill-id <id>] [--version <v>]",
        "                                       Auto detect each path: SKILL.md -> dir -> JSON fallback",
      ],
    },
  },
  {
    create: () => new CreateCommand(),
    help: { usage: ["create ...", "Deprecated alias of publish"] },
  },
  {
    create: () => new BuildCommand(),
    help: {
      usage: ["build <skillName> [refSkill...] [--all]", ""],
      details: [
        "                                       Build deps files, scans current skill dirs with --all, initializes missing target interactively",
      ],
    },
  },
  {
    create: () => new DeleteCommand(),
    help: { usage: ["delete <skillID> <version>", "Delete skill version"] },
  },
  {
    create: () => new FormatCommand(),
    help: {
      usage: ["format [skillDir...]", "Interactive format for metadata.version/metadata.author"],
      details: ["format --all                         Format all skill dirs under current directory"],
    },
  },
];

export function getHelpEntries(): HelpEntry[] {
  return [...STATIC_HELP_ENTRIES, ...COMMAND_DEFINITIONS.map((definition) => definition.help)];
}
