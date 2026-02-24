/**
 * 技能查询命令（读操作）
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";
import { callApi } from "../http/client";
import type { JsonValue } from "./types";

/**
 * 列出技能命令
 */
export class ListCommand extends BaseCommand {
  readonly name = "list";
  readonly description = "List skills (GET /api/v1/skills)";

  async execute(context: CommandContext): Promise<void> {
    const q = this.parseOptionValue(context.args, "--q");
    const path = q ? `/api/v1/skills?q=${encodeURIComponent(q)}` : "/api/v1/skills";

    const resp = await callApi({
      method: "GET",
      path,
      server: context.server,
      silent: true,
    });

    const itemsRaw = (resp.data && typeof resp.data === "object" && !Array.isArray(resp.data))
      ? (resp.data as { items?: JsonValue }).items
      : undefined;
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    const normalized = items
      .filter((x): x is Record<string, JsonValue> => !!x && typeof x === "object" && !Array.isArray(x))
      .map((x) => ({
        skill_id: x.skill_id,
        version: x.version,
        name: x.name,
        description: x.description,
      }));

    console.log(JSON.stringify({ items: normalized }, null, 2));
  }
}

/**
 * 获取技能详情命令
 */
export class GetCommand extends BaseCommand {
  readonly name = "get";
  readonly description = "Get skill overview/detail";

  async execute(context: CommandContext): Promise<void> {
    const [skillID, version] = context.args;

    if (!skillID) {
      this.fail("Missing <skillID>. Usage: skuare get <skillID> [version]");
    }

    const path = version
      ? `/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}`
      : `/api/v1/skills/${encodeURIComponent(skillID)}`;

    await callApi({
      method: "GET",
      path,
      server: context.server,
    });
  }
}

/**
 * 验证技能命令
 */
export class ValidateCommand extends BaseCommand {
  readonly name = "validate";
  readonly description = "Validate a version";

  async execute(context: CommandContext): Promise<void> {
    const [skillID, version] = context.args;

    if (!skillID || !version) {
      this.fail("Usage: skuare validate <skillID> <version>");
    }

    await callApi({
      method: "POST",
      path: `/api/v1/skills/${encodeURIComponent(skillID)}/${encodeURIComponent(version)}/validate`,
      server: context.server,
    });
  }
}
