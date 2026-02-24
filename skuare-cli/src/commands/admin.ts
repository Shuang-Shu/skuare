/**
 * 健康检查命令
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";
import { callApi } from "../http/client";

export class HealthCommand extends BaseCommand {
  readonly name = "health";
  readonly description = "Health check (GET /healthz)";

  async execute(context: CommandContext): Promise<void> {
    await callApi({
      method: "GET",
      path: "/healthz",
      server: context.server,
    });
  }
}

/**
 * 重新索引命令
 */
export class ReindexCommand extends BaseCommand {
  readonly name = "reindex";
  readonly description = "Rebuild index";

  async execute(context: CommandContext): Promise<void> {
    await callApi({
      method: "POST",
      path: "/api/v1/reindex",
      server: context.server,
      localMode: context.localMode,
      auth: context.auth,
    });
  }
}
