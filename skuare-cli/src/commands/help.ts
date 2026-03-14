/**
 * 帮助命令
 */

import { BaseCommand } from "./base";
import type { CommandContext } from "./types";
import { buildCommandHelpText, buildHelpText } from "./help_text";
import { APP_NAME, APP_VERSION } from "../app_meta";

export class HelpCommand extends BaseCommand {
  readonly name = "help";
  readonly description = "Show help";

  async execute(context: CommandContext): Promise<void> {
    if (context.args.length > 1) {
      this.fail("Usage: skuare help [command]");
    }

    const [topic] = context.args;
    if (!topic) {
      console.log(buildHelpText());
      return;
    }

    const helpText = buildCommandHelpText(topic);
    if (!helpText) {
      this.fail(`Unknown command for help: ${topic}. Run 'skuare help' to list available commands.`);
    }

    console.log(helpText);
  }
}

/**
 * 版本命令
 */
export class VersionCommand extends BaseCommand {
  readonly name = "version";
  readonly description = "Show version";

  async execute(): Promise<void> {
    console.log(`${APP_NAME} v${APP_VERSION}`);
  }
}
