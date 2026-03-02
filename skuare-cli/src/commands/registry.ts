/**
 * 命令注册表 - 注册所有可用命令
 */

import type { Command, CommandRegistry } from "./types";
import { COMMAND_DEFINITIONS } from "./catalog";
import { HelpCommand, VersionCommand } from "./help";

/**
 * 创建并注册所有命令
 */
export function createCommandRegistry(): CommandRegistry {
  const registry: CommandRegistry = new Map();

  const commands: Command[] = [
    new HelpCommand(),
    new VersionCommand(),
    ...COMMAND_DEFINITIONS.map((definition) => definition.create()),
  ];

  for (const cmd of commands) {
    registry.set(cmd.name, cmd);
  }

  return registry;
}
