import { getHelpEntries } from "./catalog";

const COMMAND_WIDTH = 37;

const GLOBAL_FLAGS = [
  ["--server <url>", "Backend URL (highest priority)"],
  ["--key-id <id>", "Signing key id for write operations"],
  ["--privkey-file <path>", "Ed25519 private key PEM file"],
] as const;

const WRITE_OPERATIONS = [
  ["publish / create / delete", "Backend write; if credentials are provided CLI signs, final acceptance is decided by server"],
  ["build", "Local dependency file write, no backend request"],
] as const;

const EXAMPLES = [
  "skr health",
  "skr detail report-generator",
  "skr detail skuare/report-generator references/details.md",
  "skr list --q pdf",
  "skr list --rgx \"report|alert\"",
  "skr peek pdf-reader 1.0.0",
  "skr peek --rgx \"^skuare/report-generator@\"",
  "skr get --rgx \".*ppt.*\"",
  "skr get pdf-reader",
  "skr get pdf-reader --global",
  "skr publish --file /tmp/create-skill.json",
  "skr publish --skill ./skills/pdf-reader/SKILL.md",
  "skr publish --dir ./skills/pdf-reader",
  "skr publish ./skills/pdf-reader",
  "skr create ./skills/pdf-reader",
  "skr build report-generator data-normalizer schema-validator",
  "skr build report-generator --all",
  "skr build report-generator normalizer=data-normalizer schema=schema-validator",
];

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

  lines.push("", "Config Precedence:", "  CLI flags > workspace config > global config > defaults");
  lines.push("", "Write Operations:");
  for (const [operation, description] of WRITE_OPERATIONS) {
    lines.push(`  ${formatAligned(operation, description)}`.trimEnd());
  }

  lines.push("", "Examples:");
  for (const example of EXAMPLES) {
    lines.push(`  ${example}`);
  }

  return `${lines.join("\n")}`;
}
