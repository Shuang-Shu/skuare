/**
 * 格式化和输出工具
 */

const COLOR_RESET = "\x1b[0m";
const COLOR_GREEN = "\x1b[32m";
const COLOR_YELLOW = "\x1b[33m";
const COLOR_RED = "\x1b[31m";

export const Status = {
  Success: `${COLOR_GREEN}[SUCCESS]${COLOR_RESET}`,
  Warn: `${COLOR_YELLOW}[WARN]${COLOR_RESET}`,
  Error: `${COLOR_RED}[ERROR]${COLOR_RESET}`,
} as const;

/**
 * 绿色输出
 */
export function green(text: string): string {
  return `${COLOR_GREEN}${text}${COLOR_RESET}`;
}

/**
 * 红色输出
 */
export function red(text: string): string {
  return `${COLOR_RED}${text}${COLOR_RESET}`;
}

/**
 * 黄色输出
 */
export function yellow(text: string): string {
  return `${COLOR_YELLOW}${text}${COLOR_RESET}`;
}

/**
 * 格式化错误并抛出
 */
export function fail(message: string): never {
  throw new Error(`${Status.Error} ${message}`);
}
