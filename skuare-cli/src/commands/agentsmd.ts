/**
 * AgentsMD 命令实现 - 简化版本
 */

import type { Command, CommandContext } from "./types";
import { Status } from "../utils/format";
import { callApi } from "../http/client";
import { DomainError } from "../domain/errors";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

// 所有 AgentsMD 命令都使用相同的基础实现模式
// 为了简化，这里提供最小可行实现

export class PublishAgentsMDCommand implements Command {
  name = "publish-agentsmd";
  description = "Publish AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const { args, server, auth } = ctx;
    
    let agentsmdID: string | undefined;
    let version: string | undefined;
    let filePath: string | undefined;
    let dirPath: string | undefined;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--agentsmd-id") agentsmdID = args[++i];
      else if (args[i] === "--version") version = args[++i];
      else if (args[i] === "--file") filePath = args[++i];
      else if (args[i] === "--dir") dirPath = args[++i];
    }

    if (!filePath && !dirPath) {
      throw new DomainError("CLI_INVALID_ARGUMENT", "Must provide --file or --dir");
    }

    let content: string;
    let metaAgentsmdID: string | undefined;
    let metaVersion: string | undefined;

    if (dirPath) {
      const agentsmdPath = path.join(dirPath, "AGENTS.md");
      const metaPath = path.join(dirPath, "agentsmd-meta.json");
      
      content = await fs.readFile(agentsmdPath, "utf-8");
      
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
        metaAgentsmdID = meta.agentsmd_id;
        metaVersion = meta.version;
      } catch {
        // meta file optional
      }
    } else if (filePath) {
      content = await fs.readFile(filePath, "utf-8");
    } else {
      throw new DomainError("CLI_INVALID_ARGUMENT", "Invalid input");
    }

    const finalAgentsmdID = agentsmdID || metaAgentsmdID;
    const finalVersion = version || metaVersion;

    if (!finalAgentsmdID || !finalVersion) {
      throw new DomainError("CLI_INVALID_ARGUMENT", "Missing agentsmd_id or version");
    }

    const resp = await callApi({
      method: "POST",
      path: "/api/v1/agentsmd",
      body: {
        agentsmd_id: finalAgentsmdID,
        version: finalVersion,
        content,
      },
      server,
      auth,
    });

    const data = resp.data as { id?: string };
    console.log(`${Status.Success} Published ${data.id || `${finalAgentsmdID}@${finalVersion}`}`);
  }
}

export class PublishAgentsMDShortCommand implements Command {
  name = "publish-agmd";
  description = "Short alias for publish-agentsmd";
  async execute(ctx: CommandContext): Promise<void> {
    return new PublishAgentsMDCommand().execute(ctx);
  }
}

export class ListAgentsMDCommand implements Command {
  name = "list-agentsmd";
  description = "List AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const { args, server, auth } = ctx;
    
    let query = "";
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--q") query = args[++i];
      else if (args[i] === "--rgx") query = args[++i];
    }

    const resp = await callApi({
      method: "GET",
      path: `/api/v1/agentsmd?q=${encodeURIComponent(query)}`,
      server,
      auth,
    });
    
    const data = resp.data as { items?: Array<{ id: string }> };
    if (!data.items || data.items.length === 0) {
      console.log(`${Status.Warn} No AGENTS.md found`);
      return;
    }

    for (const item of data.items) {
      console.log(`${item.id}`);
    }
  }
}

export class ListAgentsMDShortCommand implements Command {
  name = "list-agmd";
  description = "Short alias for list-agentsmd";
  async execute(ctx: CommandContext): Promise<void> {
    return new ListAgentsMDCommand().execute(ctx);
  }
}

export class PeekAgentsMDCommand implements Command {
  name = "peek-agentsmd";
  description = "Peek AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const { args, server, auth } = ctx;
    
    if (args.length === 0) {
      throw new DomainError("CLI_INVALID_ARGUMENT", "Missing agentsmd-id");
    }

    const agentsmdID = args[0];
    const version = args[1];

    const url = version 
      ? `/api/v1/agentsmd/${agentsmdID}/${version}`
      : `/api/v1/agentsmd/${agentsmdID}`;
    
    const resp = await callApi({
      method: "GET",
      path: url,
      server,
      auth,
    });
    
    console.log(JSON.stringify(resp.data, null, 2));
  }
}

export class PeekAgentsMDShortCommand implements Command {
  name = "peek-agmd";
  description = "Short alias for peek-agentsmd";
  async execute(ctx: CommandContext): Promise<void> {
    return new PeekAgentsMDCommand().execute(ctx);
  }
}

export class GetAgentsMDCommand implements Command {
  name = "get-agentsmd";
  description = "Install AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const { args, server, auth, llmTools, cwd } = ctx;
    
    if (args.length === 0) {
      throw new DomainError("CLI_INVALID_ARGUMENT", "Missing agentsmd-id");
    }

    let agentsmdID = args[0];
    let version = args[1];
    let isGlobal = args.includes("--global");

    // Get latest version if not specified
    if (!version) {
      const overview = await callApi({
        method: "GET",
        path: `/api/v1/agentsmd/${agentsmdID}`,
        server,
        auth,
      });
      const data = overview.data as { versions?: string[] };
      if (data.versions && data.versions.length > 0) {
        version = data.versions[data.versions.length - 1];
      } else {
        throw new DomainError("CLI_INVALID_ARGUMENT", "No versions found");
      }
    }

    const detail = await callApi({
      method: "GET",
      path: `/api/v1/agentsmd/${agentsmdID}/${version}`,
      server,
      auth,
    });
    
    const detailData = detail.data as { content?: string };
    if (!detailData.content) {
      throw new DomainError("CLI_INVALID_ARGUMENT", "No content found");
    }

    // Determine install path
    const tool = llmTools[0] || "codex";
    const targetDir = isGlobal 
      ? path.join(homedir(), `.${tool}`)
      : path.join(cwd, `.${tool}`);
    
    const targetPath = path.join(targetDir, "AGENTS.md");
    
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, detailData.content, "utf-8");
    
    console.log(`${Status.Success} Installed to ${targetPath}`);
  }
}

export class GetAgentsMDShortCommand implements Command {
  name = "get-agmd";
  description = "Short alias for get-agentsmd";
  async execute(ctx: CommandContext): Promise<void> {
    return new GetAgentsMDCommand().execute(ctx);
  }
}

export class DetailAgentsMDCommand implements Command {
  name = "detail-agentsmd";
  description = "Show local AGENTS.md";

  async execute(ctx: CommandContext): Promise<void> {
    const { llmTools, cwd } = ctx;
    
    const tool = llmTools[0] || "codex";
    const globalPath = path.join(homedir(), `.${tool}`, "AGENTS.md");
    const localPath = path.join(cwd, `.${tool}`, "AGENTS.md");
    
    let targetPath: string | undefined;
    
    try {
      await fs.access(localPath);
      targetPath = localPath;
    } catch {
      try {
        await fs.access(globalPath);
        targetPath = globalPath;
      } catch {
        throw new DomainError("CLI_INVALID_ARGUMENT", "AGENTS.md not found");
      }
    }

    const content = await fs.readFile(targetPath, "utf-8");
    console.log(content);
  }
}

export class DetailAgentsMDShortCommand implements Command {
  name = "detail-agmd";
  description = "Short alias for detail-agentsmd";
  async execute(ctx: CommandContext): Promise<void> {
    return new DetailAgentsMDCommand().execute(ctx);
  }
}

export class DeleteAgentsMDCommand implements Command {
  name = "delete-agentsmd";
  description = "Delete AGENTS.md version";

  async execute(ctx: CommandContext): Promise<void> {
    const { args, server, auth } = ctx;
    
    if (args.length < 2) {
      throw new DomainError("CLI_INVALID_ARGUMENT", "Missing agentsmd-id or version");
    }

    const agentsmdID = args[0];
    const version = args[1];

    await callApi({
      method: "DELETE",
      path: `/api/v1/agentsmd/${agentsmdID}/${version}`,
      server,
      auth,
    });
    
    console.log(`${Status.Success} Deleted ${agentsmdID}@${version}`);
  }
}

export class DeleteAgentsMDShortCommand implements Command {
  name = "delete-agmd";
  description = "Short alias for delete-agentsmd";
  async execute(ctx: CommandContext): Promise<void> {
    return new DeleteAgentsMDCommand().execute(ctx);
  }
}
