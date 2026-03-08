import assert from "node:assert/strict";
import test from "node:test";
import { parseSkillFrontmatter, parseSkillMarkdown, renderSkillTemplate, withUpdatedSkillMetadata } from "./utils/skill_manifest";

test("parseSkillMarkdown extracts frontmatter metadata and sections", () => {
  const parsed = parseSkillMarkdown([
    "---",
    'name: "demo-skill"',
    "metadata:",
    '  version: "1.2.3"',
    '  author: "demo-author"',
    'description: "Demo description"',
    "---",
    "",
    "# demo-skill",
    "",
    "## Overview",
    "Demo overview",
    "",
    "## Workflow",
    "1. Step one",
    "",
  ].join("\n"));

  assert.equal(parsed.name, "demo-skill");
  assert.equal(parsed.metadataVersion, "1.2.3");
  assert.equal(parsed.metadataAuthor, "demo-author");
  assert.equal(parsed.description, "Demo description");
  assert.equal(parsed.overview, "Demo overview");
  assert.deepEqual(parsed.sections, [{ title: "Workflow", content: "1. Step one" }]);
});

test("withUpdatedSkillMetadata normalizes top-level author/version into metadata block", () => {
  const content = [
    "---",
    'name: "demo-skill"',
    'author: "legacy-author"',
    'version: "0.0.1"',
    'description: "Demo description"',
    "---",
    "",
    "# demo-skill",
    "",
  ].join("\n");

  const next = withUpdatedSkillMetadata(content, "2.0.0", "new-author");
  const parsed = parseSkillFrontmatter(next);

  assert.equal(parsed.metadataVersion, "2.0.0");
  assert.equal(parsed.metadataAuthor, "new-author");
  assert.match(next, /metadata:/);
  assert.doesNotMatch(next, /^author:/m);
  assert.doesNotMatch(next, /^version:/m);
});

test("renderSkillTemplate produces a parseable skill document", () => {
  const rendered = renderSkillTemplate("demo-skill", "Demo description", "demo-author", "0.0.1");
  const parsed = parseSkillMarkdown(rendered);

  assert.equal(parsed.name, "demo-skill");
  assert.equal(parsed.metadataVersion, "0.0.1");
  assert.equal(parsed.metadataAuthor, "demo-author");
  assert.equal(parsed.description, "Demo description");
});
