/**
 * CLI 参数解析工具
 */

import type { CliArgs } from "../types";
import { DomainError } from "../domain/errors";

/**
 * 解析全局标志
 */
export function parseGlobalFlags(argv: string[]): CliArgs {
  let serverOverride: string | undefined;
  let keyIdOverride: string | undefined;
  let privateKeyFileOverride: string | undefined;
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];

    if (v === "--server") {
      const next = argv[i + 1];
      if (!next) {
        throw new DomainError("CLI_MISSING_OPTION_VALUE", "Missing value for --server");
      }
      serverOverride = next;
      i++;
      continue;
    }

    if (v === "--key-id") {
      const next = argv[i + 1];
      if (!next) {
        throw new DomainError("CLI_MISSING_OPTION_VALUE", "Missing value for --key-id");
      }
      keyIdOverride = next;
      i++;
      continue;
    }

    if (v === "--privkey-file") {
      const next = argv[i + 1];
      if (!next) {
        throw new DomainError("CLI_MISSING_OPTION_VALUE", "Missing value for --privkey-file");
      }
      privateKeyFileOverride = next;
      i++;
      continue;
    }

    rest.push(v);
  }

  return { serverOverride, keyIdOverride, privateKeyFileOverride, rest };
}
