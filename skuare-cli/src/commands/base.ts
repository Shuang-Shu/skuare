/**
 * 基础命令类 - 提供常用工具方法
 */

import type { Command, CommandContext } from "./types";
import { DomainError } from "../domain/errors";
import { parseOptionValue } from "../utils/command_args";
import { readJsonFile } from "../utils/fs";
import { getRegistryBackend } from "../registry/factory";
import type { RegistryBackend } from "../registry/backend";

export abstract class BaseCommand implements Command {
  abstract readonly name: string;
  abstract readonly description: string;

  abstract execute(context: CommandContext): Promise<void>;

  /**
   * 从参数中解析选项值
   */
  protected parseOptionValue(args: string[], option: string): string | undefined {
    return parseOptionValue(args, option);
  }

  /**
   * 读取 JSON 文件
   */
  protected async readJsonFile(path: string): Promise<unknown> {
    return readJsonFile(path);
  }

  /**
   * 输出错误并抛出异常
   */
  protected fail(message: string): never {
    throw new DomainError("CLI_OPERATION_FAILED", message);
  }

  protected async getBackend(context: CommandContext): Promise<RegistryBackend> {
    return getRegistryBackend(context.server);
  }

  /**
   * 彩色输出
   */
  protected colorize(text: string, colorCode: number): string {
    return `\x1b[${colorCode}m${text}\x1b[0m`;
  }

  protected green(text: string): string {
    return this.colorize(text, 32);
  }

  protected yellow(text: string): string {
    return this.colorize(text, 33);
  }

  protected red(text: string): string {
    return this.colorize(text, 31);
  }
}
