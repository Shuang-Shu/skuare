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

test("buildHelpText keeps global flags and examples", () => {
  const helpText = buildHelpText();

  assert.match(helpText, /Global Flags:/);
  assert.match(helpText, /--server <url>/);
  assert.match(helpText, /Write Operations:/);
  assert.match(helpText, /skr build report-generator --all/);
});

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
