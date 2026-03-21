import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import { BaseCommand } from "./base";
import type { CommandContext } from "./types";
import { Status } from "../utils/format";
import { collectPositionalArgs, parseRegexOption } from "../utils/command_args";
import { resolvePrimaryTool, resolveToolHomeDir } from "../utils/install_paths";
import type { RegistryAgentsMDEntry } from "../registry/types";

type AgentsMDListItem = RegistryAgentsMDEntry;

function compileRegex(pattern: string): RegExp {
  return new RegExp(pattern);
}

function matchesAgentsMD(regex: RegExp, item: AgentsMDListItem): boolean {
  return [
    String(item.id || ""),
    String(item.agentsmd_id || ""),
    String(item.name || ""),
    String(item.description || ""),
    String(item.version || ""),
  ].some((value) => {
    regex.lastIndex = 0;
    return regex.test(value);
  });
}

function toAgentsMDListOutput(item: AgentsMDListItem): Record<string, string> {
  const out: Record<string, string> = {
    id: String(item.id || ""),
    agentsmd_id: String(item.agentsmd_id || ""),
    version: String(item.version || ""),
  };
  const name = String(item.name || "").trim();
  const author = String(item.author || "").trim();
  const description = String(item.description || "").trim();
  if (name) {
    out.name = name;
  }
  if (author) {
    out.author = author;
  }
  if (description) {
    out.description = description;
  }
  return out;
}

async function readAgentsMDSource(dirPath?: string, filePath?: string): Promise<{
  content: string;
  metaAgentsMDID?: string;
  metaVersion?: string;
}> {
  if (dirPath) {
    const agentsMDPath = path.join(dirPath, "AGENTS.md");
    const metaPath = path.join(dirPath, "agentsmd-meta.json");
    const content = await fs.readFile(agentsMDPath, "utf-8");

    let metaAgentsMDID: string | undefined;
    let metaVersion: string | undefined;
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as {
        agentsmd_id?: string;
        version?: string;
      };
      metaAgentsMDID = meta.agentsmd_id;
      metaVersion = meta.version;
    } catch {
      // agentsmd-meta.json is optional.
    }

    return { content, metaAgentsMDID, metaVersion };
  }

  return {
    content: await fs.readFile(filePath as string, "utf-8"),
  };
}

export class PublishAgentsMDCommand extends BaseCommand {
  readonly name = "publish-agentsmd";
  readonly description = "Publish AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const filePath = this.parseOptionValue(ctx.args, "--file");
    const dirPath = this.parseOptionValue(ctx.args, "--dir");
    const agentsmdID = this.parseOptionValue(ctx.args, "--agentsmd-id");
    const version = this.parseOptionValue(ctx.args, "--version");

    if (!!filePath === !!dirPath) {
      this.fail("Must provide exactly one of --file or --dir");
    }

    const source = await readAgentsMDSource(dirPath, filePath);
    const finalAgentsmdID = (agentsmdID || source.metaAgentsMDID || "").trim();
    const finalVersion = (version || source.metaVersion || "").trim();

    if (!finalAgentsmdID || !finalVersion) {
      this.fail("Missing agentsmd_id or version");
    }

    const backend = await this.getBackend(ctx);
    const data = await backend.publishAgentsMD({
      agentsmdID: finalAgentsmdID,
      version: finalVersion,
      content: source.content,
      auth: ctx.auth,
    });
    console.log(`${Status.Success} Published ${data.id || `${finalAgentsmdID}@${finalVersion}`}`);
  }
}

export class ListAgentsMDCommand extends BaseCommand {
  readonly name = "list-agentsmd";
  readonly description = "List AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const positional = collectPositionalArgs(ctx.args, ["--q", "--rgx", "--regex"]);
    if (positional.length > 0) {
      this.fail("Usage: skuare list --type <agentsmd|agmd> [--q <keyword>] [--rgx <re>]. Bare positional arguments are not allowed; use --q or --rgx.");
    }
    const query = this.parseOptionValue(ctx.args, "--q") || "";
    const regexPattern = parseRegexOption(ctx.args);
    const backend = await this.getBackend(ctx);

    const regex = regexPattern
      ? (() => {
          try {
            return compileRegex(regexPattern);
          } catch {
            this.fail(`Invalid regex pattern: ${regexPattern}`);
          }
        })()
      : undefined;

    const items = await backend.listAgentsMD(query);
    const filtered = regex ? items.filter((item) => matchesAgentsMD(regex, item)) : items;
    console.log(JSON.stringify({ items: filtered.map(toAgentsMDListOutput) }, null, 2));
  }
}

export class PeekAgentsMDCommand extends BaseCommand {
  readonly name = "peek-agentsmd";
  readonly description = "Peek AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const [agentsmdID, version] = ctx.args;
    if (!agentsmdID) {
      this.fail("Missing agentsmd-id");
    }

    const backend = await this.getBackend(ctx);
    const data = version
      ? await backend.getAgentsMDVersion(agentsmdID, version)
      : await backend.getAgentsMDOverview(agentsmdID);
    console.log(JSON.stringify(data, null, 2));
  }
}

export class GetAgentsMDCommand extends BaseCommand {
  readonly name = "get-agentsmd";
  readonly description = "Install AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    if (ctx.args.includes("--wrap")) {
      this.fail("--wrap is only supported for skill resources");
    }
    if (ctx.args.includes("--slink")) {
      this.fail("--slink is only supported for skill resources");
    }

    const positional = ctx.args.filter((arg) => arg !== "--global" && arg !== "--slink");
    const [agentsmdID, versionArg] = positional;
    if (!agentsmdID) {
      this.fail("Missing agentsmd-id");
    }
    if (positional.length > 2) {
      this.fail("Usage: skuare get --type agentsmd <agentsmd-id> [version] [--global]");
    }

    const isGlobal = ctx.args.includes("--global");
    let version = versionArg;
    const backend = await this.getBackend(ctx);
    if (!version) {
      const overview = await backend.getAgentsMDOverview(agentsmdID);
      const versions = overview.versions;
      version = versions[versions.length - 1];
      if (!version) {
        this.fail("No versions found");
      }
    }

    const detail = await backend.getAgentsMDVersion(agentsmdID, version);
    const content = detail.content;
    if (!content) {
      this.fail("No content found");
    }

    const tool = resolvePrimaryTool(ctx.llmTools);
    const toolRoot = resolveToolHomeDir(ctx.cwd, tool, isGlobal);
    const targetPath = path.join(toolRoot, "AGENTS.md");
    await fs.mkdir(toolRoot, { recursive: true });
    await fs.writeFile(targetPath, content, "utf-8");
    console.log(`${Status.Success} Installed to ${targetPath}`);
  }
}

export class DetailAgentsMDCommand extends BaseCommand {
  readonly name = "detail-agentsmd";
  readonly description = "Show local AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const tool = resolvePrimaryTool(ctx.llmTools);
    const localPath = path.join(resolveToolHomeDir(ctx.cwd, tool, false), "AGENTS.md");
    const globalPath = path.join(resolveToolHomeDir(homedir(), tool, true), "AGENTS.md");
    const targetPath = await this.findExistingPath([localPath, globalPath]);
    if (!targetPath) {
      this.fail("AGENTS.md not found");
    }

    const content = await fs.readFile(targetPath, "utf-8");
    process.stdout.write(content);
  }

  private async findExistingPath(candidates: string[]): Promise<string | undefined> {
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Ignore missing paths and continue.
      }
    }
    return undefined;
  }
}

export class DeleteAgentsMDCommand extends BaseCommand {
  readonly name = "delete-agentsmd";
  readonly description = "Delete AGENTS.md version";

  async execute(ctx: CommandContext): Promise<void> {
    const [agentsmdID, version] = ctx.args;
    if (!agentsmdID || !version) {
      this.fail("Missing agentsmd-id or version");
    }

    await (await this.getBackend(ctx)).deleteAgentsMD(agentsmdID, version, ctx.auth);
    console.log(`${Status.Success} Deleted ${agentsmdID}@${version}`);
  }
}
