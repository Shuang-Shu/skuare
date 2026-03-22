import test from "node:test";
import assert from "node:assert/strict";
import { HelpCommand } from "./commands/help";
import { buildCommandHelpText, buildHelpText } from "./commands/help_text";
import { getHelpEntries } from "./commands/catalog";
import type { CommandContext } from "./commands/types";

test("buildHelpText includes all registered help entries", () => {
  const helpText = buildHelpText();

  for (const entry of getHelpEntries()) {
    assert.match(helpText, new RegExp(`(^|\\n)  ${escapeRegex(entry.name)}\\n`));
    assert.match(helpText, new RegExp(escapeRegex(entry.summary)));
    for (const usageLine of entry.usage) {
      assert.match(helpText, new RegExp(escapeRegex(usageLine)));
    }
  }
});

test("buildHelpText renders command help as indented multiline blocks", () => {
  const helpText = buildHelpText();

  assert.match(helpText, /\n  help\n    Show help\n    Usage:\n      help \[command]\n    Details:\n      Without \[command], show all commands/);
  assert.match(helpText, /\n  list\n    List skills or AGENTS\.md\n    Usage:\n      list \[--type <skill\|agentsmd\|agmd>] \[--q <keyword>] \[--rgx <re>]\n    Details:/);
});

test("buildHelpText keeps global flags", () => {
  const helpText = buildHelpText();

  assert.match(helpText, /Global Flags:/);
  assert.match(helpText, /\n  --server <url>\n    Backend URL \(highest priority\)/);
  assert.match(helpText, /\n  --key-id <id>\n    Signing key id for write operations/);
  assert.match(helpText, /\n  --privkey-file <path>\n    Ed25519 private key PEM file/);
});

test("buildHelpText uses unified --type entry and hides removed suffix commands", () => {
  const helpText = buildHelpText();

  assert.match(helpText, /--type <skill\|agentsmd\|agmd>/);
  assert.match(helpText, /\n  remote\n    Run remote write operations\n    Usage:\n      remote <publish\|update\|create\|delete> \.\.\./);
  assert.doesNotMatch(helpText, /\n  publish\n/);
  assert.doesNotMatch(helpText, /\n  update\n/);
  assert.doesNotMatch(helpText, /\n  create\n/);
  assert.doesNotMatch(helpText, /\n  delete\n/);
  assert.doesNotMatch(helpText, /publish-agentsmd/);
  assert.doesNotMatch(helpText, /publish-agmd/);
  assert.doesNotMatch(helpText, /list-agentsmd/);
  assert.doesNotMatch(helpText, /list-agmd/);
  assert.doesNotMatch(helpText, /peek-agentsmd/);
  assert.doesNotMatch(helpText, /peek-agmd/);
  assert.doesNotMatch(helpText, /get-agentsmd/);
  assert.doesNotMatch(helpText, /get-agmd/);
  assert.doesNotMatch(helpText, /detail-agentsmd/);
  assert.doesNotMatch(helpText, /detail-agmd/);
  assert.doesNotMatch(helpText, /delete-agentsmd/);
  assert.doesNotMatch(helpText, /delete-agmd/);
});

test("buildCommandHelpText renders a single command help page", () => {
  const helpText = buildCommandHelpText("get");

  assert.ok(helpText);
  assert.match(helpText, /^get\n\nInstall skill or AGENTS\.md into the selected local repository\n\nUsage:/);
  assert.match(helpText, /skuare get \[--type <skill\|agentsmd\|agmd>] <author>\/<name>@<version> \| <author>\/<name> \| <name> \[--global] \[--wrap] \[--slink]/);
  assert.match(helpText, /skr get --type <agentsmd\|agmd> <agentsmd-id> \[version] \[--global]/);
  assert.match(helpText, /Details:\n  Default mode installs skill and dependencies to local partial repository/);
  assert.match(helpText, /--slink creates symlinks to local CLI repository skill directories instead of copying remote files/);
  assert.doesNotMatch(helpText, /\nlist\n/);
});

test("buildCommandHelpText returns undefined for unknown command", () => {
  assert.equal(buildCommandHelpText("missing"), undefined);
});

test("buildCommandHelpText renders remote command help page", () => {
  const helpText = buildCommandHelpText("remote");

  assert.ok(helpText);
  assert.match(helpText, /^remote\n\nRun remote write operations\n\nUsage:/);
  assert.match(helpText, /skuare remote publish \[--type <skill\|agentsmd\|agmd>] --file <request\.json\|AGENTS\.md> \[--force\|-f]/);
  assert.match(helpText, /skr remote delete \[--type <skill\|agentsmd\|agmd>] <resourceID> <version>/);
});

test("buildHelpText describes aligned peek selector forms", () => {
  const helpText = buildHelpText();

  assert.match(helpText, /peek \[--type <skill\|agentsmd\|agmd>] <author>\/<name>@<version> \| <author>\/<name> \| <name> \[version]/);
  assert.match(helpText, /<author>\/<name>@<version> or <name>@<version>: exact version detail/);
  assert.match(helpText, /<author>\/<name> or <name>: resolve the target skill, then show overview/);
});

test("buildHelpText describes list search-only input rules", () => {
  const helpText = buildHelpText();

  assert.match(helpText, /list \[--type <skill\|agentsmd\|agmd>] \[--q <keyword>] \[--rgx <re>]/);
  assert.match(helpText, /Search input must be passed via --q or --rgx; bare positional arguments are rejected/);
});

test("HelpCommand supports help <command>", async () => {
  const logs = await captureConsole(async () => {
    await new HelpCommand().execute(createContext(["list"]));
  });

  assert.equal(logs.length, 1);
  assert.match(logs[0], /^list\n\nList skills or AGENTS\.md\n\nUsage:/);
  assert.doesNotMatch(logs[0], /\n  get\n/);
});

test("HelpCommand supports help remote", async () => {
  const logs = await captureConsole(async () => {
    await new HelpCommand().execute(createContext(["remote"]));
  });

  assert.equal(logs.length, 1);
  assert.match(logs[0], /^remote\n\nRun remote write operations\n\nUsage:/);
  assert.match(logs[0], /skuare remote <publish\|update\|create\|delete> \.\.\./);
});

test("HelpCommand rejects unknown help topic", async () => {
  await assert.rejects(
    () => new HelpCommand().execute(createContext(["missing"])),
    /Unknown command for help: missing\. Run 'skuare help' to list available commands\./,
  );
});

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createContext(args: string[]): CommandContext {
  return {
    server: "http://127.0.0.1:15657",
    localMode: true,
    cwd: process.cwd(),
    llmTools: [],
    toolSkillDirs: {},
    auth: {
      keyId: "",
      privateKeyFile: "",
    },
    args,
  };
}

async function captureConsole(run: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };
  try {
    await run();
    return logs;
  } finally {
    console.log = original;
  }
}
