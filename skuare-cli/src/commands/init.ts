/**
 * 初始化命令 - 交互式配置创建
 */

import type { CommandContext } from "./types";
import { BaseCommand } from "./base";
import type { SkuareConfig, ConfigScope, WorkspaceInitMode, RemoteMode } from "../types";
import { createDefaultConfig } from "../types";
import {
  getGlobalConfigPath,
  getGlobalConfigDirPath,
  getWorkspaceConfigPath,
  isInsidePath,
  buildServerURL,
  normalizeAddress,
} from "../config/resolver";
import { loadConfig, writeConfig } from "../config/loader";
import { mergeConfig } from "../config/merger";
import { checkServerConnectivity } from "../http/client";
import { selectScope, selectWorkspaceMode, selectModifyFields, selectRemoteMode } from "../ui/selectors";
import { selectLLMTools, askWithDefault, askYesNo, parsePort } from "../ui/prompts";
import { DomainError } from "../domain/errors";

export class InitCommand extends BaseCommand {
  readonly name = "init";
  readonly description = "Interactive init for global/workspace config";

  async execute(): Promise<void> {
    const cwd = process.cwd();
    await runInitTUI(cwd);
  }
}

/**
 * 恢复终端到正常输入模式
 */
function ensureCookedInputMode(): void {
  const stdinAny = process.stdin as unknown as {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (mode: boolean) => void;
    resume?: () => void;
  };
  if (stdinAny.isTTY && stdinAny.isRaw) {
    stdinAny.setRawMode?.(false);
  }
  stdinAny.resume?.();
}

/**
 * 打印配置快照
 */
function printConfigSnapshot(cfg: SkuareConfig): void {
  console.log(`  remote.mode: ${cfg.remote.mode}`);
  console.log(`  remote.address: ${cfg.remote.address}`);
  console.log(`  remote.port: ${cfg.remote.port}`);
  console.log(`  remote.storageDir: ${cfg.remote.storageDir}`);
  console.log(`  auth.keyId: ${cfg.auth.keyId || "(empty)"}`);
  console.log(`  auth.privateKeyFile: ${cfg.auth.privateKeyFile || "(empty)"}`);
  console.log(`  llmTools: ${cfg.llmTools.join(", ")}`);
}

/**
 * 运行初始化 TUI
 */
async function runInitTUI(cwd: string): Promise<void> {
  console.log("Skuare CLI Init (interactive)");
  console.log("Press Enter to accept default values.");

  const globalPath = getGlobalConfigPath();
  const globalDirPath = getGlobalConfigDirPath();
  const workspacePath = getWorkspaceConfigPath(cwd);

  const globalCfg = await loadConfig(globalPath);
  const globalExists = globalCfg !== undefined;

  console.log(
    `Global config: ${globalExists ? green("[EXISTS]") : red("[NOT EXISTS]")} ${globalPath}`
  );

  const defaultScope: ConfigScope = globalExists ? "workspace" : "global";
  const workspaceAllowed = !isInsidePath(cwd, globalDirPath);

  if (!workspaceAllowed) {
    console.log(
      `${yellow("[WARN]")} Current directory is inside global config dir, workspace config is disabled.`
    );
  }

  const scope = workspaceAllowed ? await selectScope(defaultScope) : "global";
  const globalBase = mergeConfig(createDefaultConfig(), globalCfg);

  let workspaceMode: WorkspaceInitMode = "new";
  if (scope === "workspace" && globalExists) {
    workspaceMode = await selectWorkspaceMode("modify");
  }

  const baseCfg =
    scope === "global"
      ? globalBase
      : workspaceMode === "new"
        ? createDefaultConfig()
        : globalBase;

  const readline = await import("node:readline/promises");
  ensureCookedInputMode();
  let rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const reopenReadline = (): void => {
    ensureCookedInputMode();
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  };
  const runArrowSelector = async <T>(fn: () => Promise<T>): Promise<T> => {
    rl.close();
    ensureCookedInputMode();
    try {
      return await fn();
    } finally {
      reopenReadline();
    }
  };

  try {
    const defaultCfg = createDefaultConfig();
    let remoteMode: RemoteMode = baseCfg.remote.mode;
    let address = baseCfg.remote.address;
    let port = baseCfg.remote.port;
    let storageDir = baseCfg.remote.storageDir;
    let keyId = baseCfg.auth.keyId;
    let privateKeyFile = baseCfg.auth.privateKeyFile;
    let llmTools = baseCfg.llmTools;
    let modifyLLMTools = scope === "global";

    if (scope === "workspace" && workspaceMode === "reuse-global") {
      // 复用全局配置，无需编辑
    } else if (scope === "workspace" && workspaceMode === "modify") {
      console.log("\nGlobal config snapshot (workspace will override selected fields):");
      printConfigSnapshot(globalBase);

      const selectedFields = await runArrowSelector(() => selectModifyFields());

      if (selectedFields.has("mode")) {
        remoteMode = await runArrowSelector(() => selectRemoteMode(remoteMode));
      }
      if (selectedFields.has("address")) {
        if (remoteMode === "remote") {
          address = await askWithDefault(rl, "Remote registry address", address);
        } else {
          address = defaultCfg.remote.address;
          console.log(`${yellow("[INFO]")} local mode uses default local address ${address}`);
        }
      }
      if (selectedFields.has("port")) {
        if (remoteMode === "remote") {
          const portRaw = await askWithDefault(rl, "Remote registry port", String(port));
          port = parsePort(portRaw);
        } else {
          port = defaultCfg.remote.port;
          console.log(`${yellow("[INFO]")} local mode uses default local port ${port}`);
        }
      }
      if (selectedFields.has("storageDir")) {
        storageDir = await askWithDefault(rl, "Remote registry storage directory", storageDir);
      }
      if (selectedFields.has("keyId")) {
        keyId = await askWithDefault(rl, "Default signing key id (optional)", keyId);
      }
      if (selectedFields.has("privateKeyFile")) {
        privateKeyFile = await askWithDefault(
          rl,
          "Default private key file path (optional)",
          privateKeyFile
        );
      }
      modifyLLMTools = selectedFields.has("llmTools");
    } else {
      remoteMode = await runArrowSelector(() => selectRemoteMode(remoteMode));
      if (remoteMode === "remote") {
        address = await askWithDefault(rl, "Remote registry address", address);
        const portRaw = await askWithDefault(rl, "Remote registry port", String(port));
        port = parsePort(portRaw);
      } else {
        address = defaultCfg.remote.address;
        port = defaultCfg.remote.port;
      }
      storageDir = await askWithDefault(rl, "Remote registry storage directory", storageDir);
      keyId = await askWithDefault(rl, "Default signing key id (optional)", keyId);
      privateKeyFile = await askWithDefault(
        rl,
        "Default private key file path (optional)",
        privateKeyFile
      );
    }

    // 连通性检查
    const connectivity = await checkServerConnectivity(normalizeAddress(address), port, 10_000);
    if (connectivity.ok) {
      console.log(
        `${green("[SUCCESS]")} Connectivity check: OK (${buildServerURL(normalizeAddress(address), port)}/healthz)`
      );
    } else {
      console.log(
        `${yellow("[WARN]")} Connectivity check: FAILED (${connectivity.reason})`
      );
      console.log(
        `${yellow("[WARN]")} Continue editing; final save confirmation will be shown at the last step.`
      );
    }
    if (remoteMode === "local") {
      console.log(`${yellow("[INFO]")} local mode enabled: write operations do not require signing`);
    }

    if (modifyLLMTools) {
      llmTools = await runArrowSelector(() => selectLLMTools(llmTools));
    }

    // 合并配置
    const targetPath = scope === "global" ? globalPath : workspacePath;
    const existing = await loadConfig(targetPath);
    const next = mergeConfig(createDefaultConfig(), existing, {
      remote: {
        mode: remoteMode,
        address: normalizeAddress(address),
        port,
        storageDir,
      },
      auth: {
        keyId,
        privateKeyFile,
      },
      llmTools,
    });

    // 最后确认
    const confirmed = await askYesNo(rl, "Save config now", true);
    if (!confirmed) {
      throw new DomainError("CLI_OPERATION_FAILED", "Aborted by user before saving");
    }

    await writeConfig(targetPath, next);

    console.log(`\n${green("[SUCCESS]")} Config saved.`);
    console.log(`  scope: ${scope}`);
    console.log(`  path:  ${targetPath}`);
    console.log(`  server preview: ${buildServerURL(next.remote.address, next.remote.port)}`);
    console.log(`  llmTools: ${next.llmTools.join(", ")}`);
    console.log("\nPrecedence: CLI flags > workspace config > global config > defaults");
  } finally {
    rl.close();
    (process.stdin as unknown as { pause?: () => void }).pause?.();
  }
}

function green(v: string): string {
  return `\x1b[32m${v}\x1b[0m`;
}

function red(v: string): string {
  return `\x1b[31m${v}\x1b[0m`;
}

function yellow(v: string): string {
  return `\x1b[33m${v}\x1b[0m`;
}
