import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import { AliasCommand } from "./alias";
import { BaseCommand } from "./base";
import type { CommandContext, JsonValue } from "./types";
import { callApi } from "../http/client";
import { Status } from "../utils/format";
import { parseRegexOption } from "../utils/command_args";
import { resolvePrimaryTool, resolveToolHomeDir } from "../utils/install_paths";

type AgentsMDListItem = {
  id?: JsonValue;
  agentsmd_id?: JsonValue;
  name?: JsonValue;
  description?: JsonValue;
  version?: JsonValue;
};

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

function getItemsFromListResponse(data: JsonValue | string | null): AgentsMDListItem[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return [];
  }
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter((item): item is AgentsMDListItem => !!item && typeof item === "object" && !Array.isArray(item));
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

    const resp = await callApi({
      method: "POST",
      path: "/api/v1/agentsmd",
      body: {
        agentsmd_id: finalAgentsmdID,
        version: finalVersion,
        content: source.content,
      },
      server: ctx.server,
      auth: ctx.auth,
      silent: true,
    });

    const data = resp.data as { id?: string } | null;
    console.log(`${Status.Success} Published ${data?.id || `${finalAgentsmdID}@${finalVersion}`}`);
  }
}

export class PublishAgentsMDShortCommand extends AliasCommand {
  constructor() {
    super("publish-agmd", "Short alias for publish-agentsmd", () => new PublishAgentsMDCommand());
  }
}

export class ListAgentsMDCommand extends BaseCommand {
  readonly name = "list-agentsmd";
  readonly description = "List AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const query = this.parseOptionValue(ctx.args, "--q") || "";
    const regexPattern = parseRegexOption(ctx.args);
    const listPath = query ? `/api/v1/agentsmd?q=${encodeURIComponent(query)}` : "/api/v1/agentsmd";
    const resp = await callApi({
      method: "GET",
      path: listPath,
      server: ctx.server,
      auth: ctx.auth,
      silent: true,
    });

    const regex = regexPattern
      ? (() => {
          try {
            return compileRegex(regexPattern);
          } catch {
            this.fail(`Invalid regex pattern: ${regexPattern}`);
          }
        })()
      : undefined;

    const items = getItemsFromListResponse(resp.data);
    const filtered = regex ? items.filter((item) => matchesAgentsMD(regex, item)) : items;
    console.log(JSON.stringify({ items: filtered }, null, 2));
  }
}

export class ListAgentsMDShortCommand extends AliasCommand {
  constructor() {
    super("list-agmd", "Short alias for list-agentsmd", () => new ListAgentsMDCommand());
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

    const apiPath = version
      ? `/api/v1/agentsmd/${encodeURIComponent(agentsmdID)}/${encodeURIComponent(version)}`
      : `/api/v1/agentsmd/${encodeURIComponent(agentsmdID)}`;

    const resp = await callApi({
      method: "GET",
      path: apiPath,
      server: ctx.server,
      auth: ctx.auth,
      silent: true,
    });

    console.log(JSON.stringify(resp.data, null, 2));
  }
}

export class PeekAgentsMDShortCommand extends AliasCommand {
  constructor() {
    super("peek-agmd", "Short alias for peek-agentsmd", () => new PeekAgentsMDCommand());
  }
}

export class GetAgentsMDCommand extends BaseCommand {
  readonly name = "get-agentsmd";
  readonly description = "Install AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const positional = ctx.args.filter((arg) => arg !== "--global");
    const [agentsmdID, versionArg] = positional;
    if (!agentsmdID) {
      this.fail("Missing agentsmd-id");
    }

    const isGlobal = ctx.args.includes("--global");
    let version = versionArg;
    if (!version) {
      const overview = await callApi({
        method: "GET",
        path: `/api/v1/agentsmd/${encodeURIComponent(agentsmdID)}`,
        server: ctx.server,
        auth: ctx.auth,
        silent: true,
      });
      const data = overview.data as { versions?: string[] } | null;
      const versions = Array.isArray(data?.versions) ? data.versions : [];
      version = versions[versions.length - 1];
      if (!version) {
        this.fail("No versions found");
      }
    }

    const detail = await callApi({
      method: "GET",
      path: `/api/v1/agentsmd/${encodeURIComponent(agentsmdID)}/${encodeURIComponent(version)}`,
      server: ctx.server,
      auth: ctx.auth,
      silent: true,
    });
    const content = String((detail.data as { content?: JsonValue } | null)?.content || "");
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

export class GetAgentsMDShortCommand extends AliasCommand {
  constructor() {
    super("get-agmd", "Short alias for get-agentsmd", () => new GetAgentsMDCommand());
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

export class DetailAgentsMDShortCommand extends AliasCommand {
  constructor() {
    super("detail-agmd", "Short alias for detail-agentsmd", () => new DetailAgentsMDCommand());
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

    await callApi({
      method: "DELETE",
      path: `/api/v1/agentsmd/${encodeURIComponent(agentsmdID)}/${encodeURIComponent(version)}`,
      server: ctx.server,
      auth: ctx.auth,
      silent: true,
    });
    console.log(`${Status.Success} Deleted ${agentsmdID}@${version}`);
  }
}

export class DeleteAgentsMDShortCommand extends AliasCommand {
  constructor() {
    super("delete-agmd", "Short alias for delete-agentsmd", () => new DeleteAgentsMDCommand());
  }
}
