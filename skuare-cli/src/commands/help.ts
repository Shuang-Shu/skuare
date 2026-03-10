/**
 * 帮助命令
 */

import { BaseCommand } from "./base";
import { buildHelpText } from "./help_text";
import { APP_NAME, APP_VERSION } from "../app_meta";

export class HelpCommand extends BaseCommand {
  readonly name = "help";
  readonly description = "Show help";

  async execute(): Promise<void> {
    console.log(buildHelpText());
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
