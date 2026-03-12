import { BaseCommand } from "./base";
import type { CommandContext } from "./types";
import { findNearestWorkspaceConfig, getGlobalConfigPath } from "../config/resolver";
import { loadConfig } from "../config/loader";

export class ConfigCommand extends BaseCommand {
  readonly name = "config";
  readonly description = "Show config file content";

  async execute(context: CommandContext): Promise<void> {
    const isGlobal = context.args.includes("--global");
    const positional = context.args.filter((arg) => arg !== "--global");
    if (positional.length > 0) {
      this.fail("Usage: skuare config [--global]");
    }

    if (isGlobal) {
      const path = getGlobalConfigPath();
      const config = await loadConfig(path);
      if (config === undefined) {
        this.fail(`Global config not found: ${path}`);
      }
      console.log(JSON.stringify({
        scope: "global",
        path,
        config,
      }, null, 2));
      return;
    }

    const found = await findNearestWorkspaceConfig(context.cwd);
    if (!found) {
      this.fail(`Workspace config not found from ${context.cwd} up to /`);
    }
    console.log(JSON.stringify({
      scope: "workspace",
      path: found.path,
      config: found.config,
    }, null, 2));
  }
}
