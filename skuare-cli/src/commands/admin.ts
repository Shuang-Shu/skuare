/**
 * 健康检查命令
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";

export class HealthCommand extends BaseCommand {
  readonly name = "health";
  readonly description = "Health check (GET /healthz)";

  async execute(context: CommandContext): Promise<void> {
    console.log(JSON.stringify(await this.getBackend(context).then((backend) => backend.health()), null, 2));
  }
}
