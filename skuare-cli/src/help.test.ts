import test from "node:test";
import assert from "node:assert/strict";
import { buildHelpText } from "./commands/help_text";
import { getHelpEntries } from "./commands/catalog";

test("buildHelpText includes all registered help entries", () => {
  const helpText = buildHelpText();

  for (const entry of getHelpEntries()) {
    assert.match(helpText, new RegExp(escapeRegex(entry.usage[0])));
    if (entry.usage[1]) {
      assert.match(helpText, new RegExp(escapeRegex(entry.usage[1])));
    }
  }
});

test("buildHelpText keeps global flags", () => {
  const helpText = buildHelpText();

  assert.match(helpText, /Global Flags:/);
  assert.match(helpText, /--server <url>/);
  assert.match(helpText, /--key-id <id>/);
  assert.match(helpText, /--privkey-file <path>/);
});

test("buildHelpText uses unified --type entry and hides removed suffix commands", () => {
  const helpText = buildHelpText();

  assert.match(helpText, /--type <skill\|agentsmd\|agmd>/);
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

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
