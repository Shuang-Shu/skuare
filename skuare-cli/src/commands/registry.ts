/**
 * 命令注册表 - 注册所有可用命令
 */

import type { Command, CommandRegistry } from "./types";
import { HelpCommand, VersionCommand } from "./help";
import { HealthCommand } from "./admin";
import { ListCommand, GetCommand, PeekCommand, ValidateCommand } from "./query";
import { BuildCommand, CreateCommand, DeleteCommand, FormatCommand, PublishCommand } from "./write";
import { InitCommand } from "./init";

/**
 * 创建并注册所有命令
 */
export function createCommandRegistry(): CommandRegistry {
  const registry: CommandRegistry = new Map();

  const commands: Command[] = [
    new HelpCommand(),
    new VersionCommand(),
    new InitCommand(),
    new HealthCommand(),
    new ListCommand(),
    new PeekCommand(),
    new GetCommand(),
    new ValidateCommand(),
    new PublishCommand(),
    new CreateCommand(),
    new BuildCommand(),
    new DeleteCommand(),
    new FormatCommand(),
  ];

  for (const cmd of commands) {
    registry.set(cmd.name, cmd);
  }

  return registry;
}
