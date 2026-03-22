import type { Command, CommandContext } from "./types";
import { BaseCommand } from "./base";
import { withCommandArgs } from "./resource_type";
import { RemoteSourceCommand } from "./remote_source";
import { CreateCommand, DeleteCommand, PublishCommand, UpdateCommand } from "./write";

export const REMOTE_SUBCOMMAND_NAMES = ["publish", "update", "create", "delete", "source"] as const;

export const REMOTE_HELP_ENTRY: {
  name: string;
  summary: string;
  usage: string[];
  details: string[];
} = {
  name: "remote",
  summary: "Run remote registry operations",
  usage: [
    "remote <publish|update|create|delete|source> ...",
    "remote publish [--type <skill|agentsmd|agmd>] --file <request.json|AGENTS.md> [--force|-f]",
    "remote update <skillRef> <newSkillDir>",
    "remote create ... [--type <skill|agentsmd|agmd>] [--force|-f]",
    "remote delete [--type <skill|agentsmd|agmd>] <resourceID> <version>",
    "remote source list [--global]",
    "remote source add [--global] <originName> [--git|--svc] <remoteUrl>",
    "remote source remove [--global] <originName>",
    "remote source select [--global] <originName>",
  ],
  details: [
    "remote is the unified entry for remote registry operations",
    "publish, update, create, and delete reuse the existing write command implementations",
    "source manages named remote registry sources stored in config.json",
    "`remote source use` is kept as a compatibility alias for `remote source select`",
    "Run `skuare help remote` to inspect the supported remote subcommands",
  ],
};

type RemoteSubcommandFactory = () => Command;

function createDefaultRemoteSubcommands(): Map<string, RemoteSubcommandFactory> {
  return new Map<string, RemoteSubcommandFactory>([
    ["publish", () => new PublishCommand()],
    ["update", () => new UpdateCommand()],
    ["create", () => new CreateCommand()],
    ["delete", () => new DeleteCommand()],
    ["source", () => new RemoteSourceCommand()],
  ]);
}

export class RemoteCommand extends BaseCommand {
  readonly name = "remote";
  readonly description = "Run remote registry operations";

  constructor(
    private readonly subcommands: ReadonlyMap<string, RemoteSubcommandFactory> = createDefaultRemoteSubcommands(),
  ) {
    super();
  }

  async execute(context: CommandContext): Promise<void> {
    const [subcommandName, ...subcommandArgs] = context.args;
    if (!subcommandName || subcommandName === "help" || subcommandName === "--help" || subcommandName === "-h") {
      console.log(this.renderHelp());
      return;
    }

    const factory = this.subcommands.get(subcommandName);
    if (!factory) {
      this.fail(
        `Unknown remote subcommand: ${subcommandName}. Supported: ${REMOTE_SUBCOMMAND_NAMES.join(", ")}`
      );
    }

    await factory().execute(withCommandArgs(context, subcommandArgs));
  }

  private renderHelp(): string {
    const lines = [
      "remote",
      "",
      "Run remote registry operations",
      "",
      "Usage:",
      ...REMOTE_HELP_ENTRY.usage.map((usageLine) => `  skuare ${usageLine}`),
      ...REMOTE_HELP_ENTRY.usage.map((usageLine) => `  skr ${usageLine}`),
      "",
      "Details:",
      ...REMOTE_HELP_ENTRY.details.map((detail) => `  ${detail}`),
    ];
    return lines.join("\n");
  }
}
