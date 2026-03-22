import type { CommandContext } from "./types";
import { DomainError } from "../domain/errors";
import { parseOptionValue, stripOptionsWithValues } from "../utils/command_args";

export type ResourceType = "skill" | "agentsmd";

const TYPE_VALUE_ALIASES: Record<string, ResourceType> = {
  skill: "skill",
  agentsmd: "agentsmd",
  agmd: "agentsmd",
};

const REMOVED_COMMAND_REPLACEMENTS: Record<string, string> = {
  publish: "remote publish",
  update: "remote update",
  create: "remote create",
  delete: "remote delete",
  "publish-agentsmd": "remote publish --type agentsmd",
  "publish-agmd": "remote publish --type agmd",
  "list-agentsmd": "list --type agentsmd",
  "list-agmd": "list --type agmd",
  "peek-agentsmd": "peek --type agentsmd",
  "peek-agmd": "peek --type agmd",
  "get-agentsmd": "get --type agentsmd",
  "get-agmd": "get --type agmd",
  "detail-agentsmd": "detail --type agentsmd",
  "detail-agmd": "detail --type agmd",
  "delete-agentsmd": "remote delete --type agentsmd",
  "delete-agmd": "remote delete --type agmd",
};

export function parseResourceType(args: string[]): ResourceType {
  const rawValue = parseOptionValue(args, "--type");
  if (!rawValue) {
    return "skill";
  }
  const normalized = TYPE_VALUE_ALIASES[rawValue.trim().toLowerCase()];
  if (!normalized) {
    throw new DomainError(
      "CLI_INVALID_ARGUMENT",
      `Invalid value for --type: ${rawValue}. Expected one of: skill, agentsmd, agmd`
    );
  }
  return normalized;
}

export function stripResourceTypeOption(args: string[]): string[] {
  return stripOptionsWithValues(args, ["--type"]);
}

export function withCommandArgs(context: CommandContext, args: string[]): CommandContext {
  return {
    ...context,
    args,
  };
}

export function normalizeResourceContext(
  context: CommandContext
): { resourceType: ResourceType; context: CommandContext } {
  return {
    resourceType: parseResourceType(context.args),
    context: withCommandArgs(context, stripResourceTypeOption(context.args)),
  };
}

export function getRemovedCommandSuggestion(commandName: string, args: string[]): string | undefined {
  const replacement = REMOVED_COMMAND_REPLACEMENTS[commandName];
  if (!replacement) {
    return undefined;
  }
  const suffix = args.length > 0 ? ` ${args.join(" ")}` : "";
  return `${replacement}${suffix}`;
}
