/**
 * 健康检查命令
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";
import { callApi } from "../registry/client";

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
