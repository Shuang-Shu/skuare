import { getHelpEntries, getHelpEntry, type HelpEntry } from "./catalog";

const GLOBAL_FLAGS = [
  ["--server <url>", "Backend URL (highest priority)"],
  ["--key-id <id>", "Signing key id for write operations"],
  ["--privkey-file <path>", "Ed25519 private key PEM file"],
] as const;

function renderCommandBlock(entry: HelpEntry): string[] {
  const lines: string[] = [`  ${entry.name}`, `    ${entry.summary}`, "    Usage:"];

  for (const usageLine of entry.usage) {
    lines.push(`      ${usageLine}`);
  }

  if (entry.details?.length) {
    lines.push("    Details:");
    for (const detail of entry.details) {
      lines.push(`      ${detail}`);
    }
  }

  return lines;
}

function renderGlobalFlags(indent = "  "): string[] {
  const lines = ["Global Flags:"];
  for (const [flag, description] of GLOBAL_FLAGS) {
    lines.push(`${indent}${flag}`);
    lines.push(`${indent}  ${description}`);
  }
  return lines;
}

export function buildHelpText(): string {
  const lines: string[] = [
    "skuare",
    "",
    "Usage:",
    "  skuare [global flags] <command>",
    "  skr [global flags] <command>",
    "",
    "Commands:",
  ];

  for (const entry of getHelpEntries()) {
    lines.push(...renderCommandBlock(entry), "");
  }

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  lines.push("", ...renderGlobalFlags());

  return `${lines.join("\n")}`;
}

export function buildCommandHelpText(name: string): string | undefined {
  const entry = getHelpEntry(name);
  if (!entry) {
    return undefined;
  }

  const lines: string[] = [entry.name, "", entry.summary, "", "Usage:"];

  for (const usageLine of entry.usage) {
    lines.push(`  skuare ${usageLine}`);
    lines.push(`  skr ${usageLine}`);
  }

  if (entry.details?.length) {
    lines.push("", "Details:");
    for (const detail of entry.details) {
      lines.push(`  ${detail}`);
    }
  }

  lines.push("", ...renderGlobalFlags());

  return `${lines.join("\n")}`;
}
