/**
 * 命令接口定义
 */

/**
 * JSON 值类型
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

/**
 * 命令执行上下文
 */
export type CommandContext = {
  server: string;
  localMode: boolean;
  cwd: string;
  llmTools: string[];
  auth: {
    keyId: string;
    privateKeyFile: string;
  };
  args: string[];
};

/**
 * 命令接口
 */
export interface Command {
  /**
   * 命令名称
   */
  readonly name: string;

  /**
   * 命令描述
   */
  readonly description: string;

  /**
   * 执行命令
   * @param context 执行上下文
   */
  execute(context: CommandContext): Promise<void>;
}

/**
 * 命令注册表
 */
export type CommandRegistry = Map<string, Command>;
