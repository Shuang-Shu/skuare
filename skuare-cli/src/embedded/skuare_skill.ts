import { APP_VERSION } from "../app_meta";

export const SKUARE_SKILL_AUTHOR = "skuare";

export type EmbeddedSkillFile = {
  path: string;
  content: string;
};

export function buildSkuareSkillFiles(skillName: string): EmbeddedSkillFile[] {
  return [
    {
      path: "SKILL.md",
      content: renderSkuareSkill(skillName),
    },
    {
      path: "references/skuare-workflow.md",
      content: renderSkuareWorkflowReference(),
    },
  ];
}

function renderSkuareSkill(skillName: string): string {
  return [
    "---",
    `name: ${toYamlString(skillName)}`,
    "metadata:",
    `  version: ${toYamlString(APP_VERSION)}`,
    `  author: ${toYamlString(SKUARE_SKILL_AUTHOR)}`,
    `description: ${toYamlString("Use when the user asks to manage Skuare skills, inspect local skill packages, install remote skills, or publish skill changes with skr/skuare in the current workspace.")}`,
    "---",
    "",
    `# ${skillName}`,
    "",
    "## Overview",
    "Use this skill when the task should be completed with `skr` or `skuare` commands in the current workspace.",
    "",
    "## Workflow",
    "1. Read `references/skuare-workflow.md` before changing local skill files or issuing CLI commands.",
    "2. Prefer `skr` for local skill lifecycle work such as inspect, build, install, validate, and publish preparation.",
    "3. Report exactly what changed, what was validated, and any follow-up command the user may need.",
    "",
  ].join("\n");
}

function renderSkuareWorkflowReference(): string {
  return [
    "# Skuare Workflow",
    "",
    "## When To Use",
    "- Use this skill when the user asks to create, inspect, install, update, or publish Skuare skills with `skr` or `skuare`.",
    "- Work from the current directory and treat local `SKILL.md`, dependency files, and references as the source of truth.",
    "",
    "## Core Commands",
    "- `skr detail <skillName|skillID> [relativePath...]`: inspect local installed skill files.",
    "- `skr build <skillName> [refSkill...] [--all]`: update local dependency files for an existing or new local skill directory.",
    "- `skr get <skillRef> [version] [--global] [--wrap]`: install remote skills into local tool directories.",
    "- `skr deps --brief|--content|--tree|--install <rootSkillDir> ...`: inspect or install wrapped dependencies.",
    "- `skr publish --dir <skillDir>`: publish a local skill directory when metadata and files are ready.",
    "",
    "## Operating Rules",
    "- Read before writing, and keep `SKILL.md` metadata aligned with the intended release.",
    "- Prefer non-destructive operations; if local files already differ from the embedded template, stop and let the user decide how to proceed.",
    "- Run the package checks or tests required by the workspace before claiming completion.",
    "",
  ].join("\n");
}

function toYamlString(input: string): string {
  return `"${input.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}
