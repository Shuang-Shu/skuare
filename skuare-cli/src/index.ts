#!/usr/bin/env node

/**
 * Skuare CLI 主入口
 *
 * 使用命令模式组织代码结构：
 * - commands/: 命令处理器
 * - config/: 配置管理
 * - http/: HTTP 客户端
 * - ui/: TUI 交互组件
 * - types/: 类型定义
 * - utils/: 工具函数
 */

import { parseGlobalFlags } from "./utils/parser";
import { Status } from "./utils/format";
import { resolveConfig } from "./config/resolver";
import { createCommandRegistry } from "./commands/registry";
import { buildHelpText } from "./commands/help_text";
import type { CommandContext } from "./commands/types";
import { formatDomainError, normalizeUnknownError } from "./domain/errors";

/**
 * 主函数
 */
async function main(): Promise<void> {
  try {
    const [, , ...args] = process.argv;
    const parsed = parseGlobalFlags(args);
    const [commandName, ...rest] = parsed.rest;

    // 创建命令注册表
    const registry = createCommandRegistry();

    // 默认命令：help
    const name = !commandName || commandName === "help" || commandName === "--help" || commandName === "-h"
      ? "help"
      : commandName;

    // 版本命令特殊处理
    if (name === "version" || name === "--version" || name === "-v") {
      console.log("skuare v0.1.0");
      return;
    }

    // 查找命令
    const command = registry.get(name);
    if (!command) {
      console.error(`${Status.Error} [CLI_INVALID_ARGUMENT] Unknown command: ${[commandName, ...rest].filter(Boolean).join(" ")}`);
      console.log(buildHelpText());
      process.exit(1);
      return;
    }

    // 解析配置
    const cwd = process.cwd();
    const resolved = await resolveConfig(cwd, parsed);

    // 构建命令上下文
    const context: CommandContext = {
      server: resolved.server,
      localMode: resolved.localMode,
      cwd,
      llmTools: resolved.merged.llmTools,
      toolSkillDirs: resolved.merged.toolSkillDirs,
      auth: resolved.auth,
      args: rest,
    };

    // 执行命令
    await command.execute(context);
  } catch (err) {
    const domainErr = normalizeUnknownError(err);
    console.error(`${Status.Error} ${formatDomainError(domainErr)}`);
    process.exit(1);
  }
}

// 启动应用
void main();
