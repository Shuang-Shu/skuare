import { getHelpEntries } from "./catalog";

const COMMAND_WIDTH = 37;

const GLOBAL_FLAGS = [
  ["--server <url>", "Backend URL (highest priority)"],
  ["--key-id <id>", "Signing key id for write operations"],
  ["--privkey-file <path>", "Ed25519 private key PEM file"],
] as const;

function formatAligned(left: string, right: string): string {
  const padded = left.length >= COMMAND_WIDTH ? `${left} ` : left.padEnd(COMMAND_WIDTH, " ");
  return `${padded}${right}`;
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
    const [commandUsage, description] = entry.usage;
    lines.push(`  ${formatAligned(commandUsage, description)}`.trimEnd());
    for (const detail of entry.details || []) {
      lines.push(`  ${detail}`.trimEnd());
    }
  }

  lines.push("", "Global Flags:");
  for (const [flag, description] of GLOBAL_FLAGS) {
    lines.push(`  ${formatAligned(flag, description)}`.trimEnd());
  }

  return `${lines.join("\n")}`;
}
