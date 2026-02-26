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
      printHelp();
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

/**
 * 打印帮助信息（备用）
 */
function printHelp(): void {
  console.log(`skuare

Usage:
  skuare [global flags] <command>
  skr [global flags] <command>

Commands:
  help                                 Show help
  version                              Show version
  init                                 Interactive init for global/workspace config
  health                               Health check (GET /healthz)
  list [--q <keyword>]                 List skills (GET /api/v1/skills)
  peek <skillID> [version]             Peek skill overview/detail
  get <skillID> [version]              Install skill to local llm tool directory
  validate <skillID> <version>         Validate a version
  create --file <request.json>         Create from request JSON
  create --skill <SKILL.md> [--skill-id <id>] [--version <v>]
                                       Explicit SKILL.md mode, version from frontmatter metadata.version
  create --dir <skillDir> [--skill-id <id>] [--version <v>]
                                       Explicit dir mode, version from <dir>/SKILL.md frontmatter metadata.version
  create <path...> [--all] [--skill-id <id>] [--version <v>]
                                       Auto detect each path: SKILL.md -> dir -> JSON fallback
  delete <skillID> <version>           Delete skill version
  format [skillDir...]                 Interactive format for metadata.version/metadata.author
  format --all                         Format all skill dirs under current directory

Global Flags:
  --server <url>                       Backend URL (highest priority)
  --key-id <id>                        Signing key id for write operations
  --privkey-file <path>                Ed25519 private key PEM file

Config Precedence:
  CLI flags > workspace config > global config > defaults

Examples:
  skr health
  skr list --q pdf
  skr peek pdf-reader 1.0.0
  skr get pdf-reader
  skr create --file /tmp/create-skill.json
  skr create --skill ./skills/pdf-reader/SKILL.md
  skr create --dir ./skills/pdf-reader
  skr create ./skills/pdf-reader
  skr create /tmp/create-skill.json`);
}

// 启动应用
void main();
