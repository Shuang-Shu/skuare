/**
 * 基础命令类 - 提供常用工具方法
 */

import type { Command, CommandContext } from "./types";

export abstract class BaseCommand implements Command {
  abstract readonly name: string;
  abstract readonly description: string;

  abstract execute(context: CommandContext): Promise<void>;

  /**
   * 从参数中解析选项值
   */
  protected parseOptionValue(args: string[], option: string): string | undefined {
    const idx = args.indexOf(option);
    if (idx < 0) {
      return undefined;
    }
    const value = args[idx + 1];
    if (!value) {
      throw new Error(`Missing value for ${option}`);
    }
    return value;
  }

  /**
   * 读取 JSON 文件
   */
  protected async readJsonFile(path: string): Promise<unknown> {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw) as unknown;
  }

  /**
   * 输出错误并抛出异常
   */
  protected fail(message: string): never {
    throw new Error(`${this.colorize("[ERROR]", 31)} ${message}`);
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
