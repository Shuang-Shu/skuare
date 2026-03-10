import { DomainError } from "../domain/errors";

export type ParsedSkillFrontmatter = {
  name: string;
  description: string;
  metadataVersion: string;
  metadataAuthor: string;
};

export type ParsedSkillSection = {
  title: string;
  content: string;
};

export type ParsedSkillMarkdown = ParsedSkillFrontmatter & {
  overview: string;
  sections: ParsedSkillSection[];
};

export function parseSkillFrontmatter(content: string): ParsedSkillFrontmatter {
  const parsed = parseFrontmatter(content);
  if (!parsed) {
    return { name: "", description: "", metadataVersion: "", metadataAuthor: "" };
  }

  let name = "";
  let description = "";
  let metadataVersion = "";
  let metadataAuthor = "";
  let metadataIndent = -1;
  for (const rawLine of parsed.frontmatterLines) {
    const line = rawLine.trim();
    const indent = rawLine.length - rawLine.trimStart().length;
    if (!line) {
      continue;
    }
    if (line === "metadata:") {
      metadataIndent = indent;
      continue;
    }
    if (metadataIndent >= 0) {
      if (indent <= metadataIndent) {
        metadataIndent = -1;
      } else if (line.startsWith("version:")) {
        metadataVersion = unquoteYaml(line.slice("version:".length).trim());
        continue;
      } else if (line.startsWith("author:")) {
        metadataAuthor = unquoteYaml(line.slice("author:".length).trim());
        continue;
      }
    }
    if (line.startsWith("name:")) {
      name = unquoteYaml(line.slice("name:".length).trim());
      continue;
    }
    if (line.startsWith("description:")) {
      description = unquoteYaml(line.slice("description:".length).trim());
      continue;
    }
  }

  return { name, description, metadataVersion, metadataAuthor };
}

export function parseSkillMarkdown(content: string): ParsedSkillMarkdown {
  const parsed = parseFrontmatter(content);
  if (!parsed) {
    throw new DomainError("CLI_OPERATION_FAILED", "SKILL.md must start with YAML frontmatter");
  }

  const frontmatter = parseSkillFrontmatter(content);
  if (!frontmatter.name) {
    throw new DomainError("CLI_OPERATION_FAILED", "Frontmatter requires name");
  }
  if (!frontmatter.metadataVersion) {
    throw new DomainError("CLI_OPERATION_FAILED", "Frontmatter requires metadata.version");
  }
  if (!frontmatter.description) {
    throw new DomainError("CLI_OPERATION_FAILED", "Frontmatter requires description");
  }

  const blocks = parseH2Blocks(parsed.bodyLines.join("\n"));
  const overview = (blocks.find((block) => block.title.toLowerCase() === "overview")?.content || "").trim();
  const sections = blocks
    .filter((block) => block.title.toLowerCase() !== "overview" && block.content.trim() !== "")
    .map((block) => ({ title: block.title, content: block.content.trim() }));

  return {
    ...frontmatter,
    overview,
    sections,
  };
}

export function readSkillMetadataDefaults(content: string): { version: string; author: string } {
  const frontmatter = parseSkillFrontmatter(content);
  return {
    version: frontmatter.metadataVersion,
    author: frontmatter.metadataAuthor,
  };
}

export function withUpdatedSkillMetadata(content: string, version: string, author: string): string {
  const versionValue = toYamlString(version);
  const authorValue = toYamlString(author);
  const parsed = parseFrontmatter(content);

  if (!parsed) {
    const frontmatter = ["---", "metadata:", `  author: ${authorValue}`, `  version: ${versionValue}`, "---", ""];
    return `${frontmatter.join("\n")}${content}`;
  }

  const frontmatterLines = [...parsed.frontmatterLines];
  const topLevel = takeTopLevelAuthorAndVersion(frontmatterLines);
  const metadataRange = findMetadataRange(frontmatterLines);

  if (!metadataRange) {
    frontmatterLines.push("metadata:");
    frontmatterLines.push(`  author: ${authorValue || topLevel.author}`);
    frontmatterLines.push(`  version: ${versionValue || topLevel.version}`);
  } else {
    let hasAuthor = false;
    let hasVersion = false;
    for (let i = metadataRange.start + 1; i <= metadataRange.end; i += 1) {
      const line = frontmatterLines[i].trim();
      if (line.startsWith("author:")) {
        hasAuthor = true;
      }
      if (line.startsWith("version:")) {
        hasVersion = true;
      }
    }
    if (hasAuthor) {
      for (let i = metadataRange.start + 1; i <= metadataRange.end; i += 1) {
        if (frontmatterLines[i].trim().startsWith("author:")) {
          frontmatterLines[i] = `  author: ${authorValue}`;
          break;
        }
      }
    } else {
      frontmatterLines.splice(metadataRange.end + 1, 0, `  author: ${authorValue || topLevel.author}`);
      metadataRange.end += 1;
    }
    if (hasVersion) {
      for (let i = metadataRange.start + 1; i <= metadataRange.end; i += 1) {
        if (frontmatterLines[i].trim().startsWith("version:")) {
          frontmatterLines[i] = `  version: ${versionValue}`;
          break;
        }
      }
    } else {
      frontmatterLines.splice(metadataRange.end + 1, 0, `  version: ${versionValue || topLevel.version}`);
    }
  }

  return ["---", ...frontmatterLines, "---", ...parsed.bodyLines].join("\n");
}

export function renderSkillTemplate(skillID: string, description: string, author: string, version: string): string {
  const safeSkillID = toYamlString(skillID);
  const safeDescription = toYamlString(description);
  const safeAuthor = toYamlString(author);
  const safeVersion = toYamlString(version);

  return [
    "---",
    `name: ${safeSkillID}`,
    "metadata:",
    `  version: ${safeVersion}`,
    `  author: ${safeAuthor}`,
    `description: ${safeDescription}`,
    "---",
    "",
    `# ${skillID}`,
    "",
    "## Overview",
    `Use this skill when you need ${skillID} to deliver its intended workflow.`,
    "",
    "## Inputs Needed",
    "- Clarify the user goal and expected output.",
    "- Gather any required context, files, or constraints before execution.",
    "",
    "## Workflow",
    "1. Confirm the task scope and success criteria.",
    "2. Execute the core workflow for this skill.",
    "3. Return the result with any important caveats or next steps.",
    "",
    "## Output Contract",
    "- Return the requested result directly.",
    "- Call out assumptions, risks, or follow-up actions when relevant.",
    "",
  ].join("\n");
}

export function renderSkrSkillTemplate(skillID: string, description: string, author: string, version: string): string {
  const safeSkillID = toYamlString(skillID);
  const safeDescription = toYamlString(description);
  const safeAuthor = toYamlString(author);
  const safeVersion = toYamlString(version);

  return [
    "---",
    `name: ${safeSkillID}`,
    "metadata:",
    `  version: ${safeVersion}`,
    `  author: ${safeAuthor}`,
    `description: ${safeDescription}`,
    "---",
    "",
    `# ${skillID}`,
    "",
    "## Overview",
    "Use this skill when the user asks to work with this package's domain workflow, deliver the package's intended output, or maintain its local resources with Skuare.",
    "",
    "## Workflow",
    "1. Clarify the user's target outcome, input artifacts, and delivery constraints before making changes.",
    "2. Read `references/skuare-workflow.md` before editing so the local authoring, validation, and publish flow stays consistent.",
    "3. Make only the files needed for the requested outcome and keep the final response focused on concrete results.",
    "",
    "## Output Contract",
    "- Return the requested deliverable directly.",
    "- Call out assumptions, validation status, and any follow-up publish or dependency actions.",
    "",
  ].join("\n");
}

export function renderSkrSkillWorkflowReference(skillID: string): string {
  return [
    `# ${skillID} Skuare Workflow`,
    "",
    "## When To Use",
    "- Use this skill when the user asks to create, revise, validate, or publish the current package as a Skuare skill.",
    "- Treat the current directory as the source of truth for the skill package.",
    "",
    "## Local Workflow",
    "1. Read `SKILL.md` and any local reference files before editing.",
    "2. Keep frontmatter metadata aligned with the package intent and release version.",
    "3. Use `skr build --skr-skill [refSkill...] [--all]` to refresh dependency files for the current directory.",
    "4. Run the project's required checks before publish or handoff.",
    "",
    "## Publish Checklist",
    "- Confirm `metadata.version` is set and incremented when publishing a new version.",
    "- Verify dependency files match the current local references.",
    "- Publish with `skr publish --dir .` when the package is ready.",
    "",
  ].join("\n");
}

export function toYamlString(input: string): string {
  return `"${input.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

export function unquoteYaml(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim();
  }
  return value.trim();
}

function parseFrontmatter(content: string): { frontmatterLines: string[]; bodyLines: string[] } | undefined {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return undefined;
  }

  let frontmatterEnd = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      frontmatterEnd = i;
      break;
    }
  }
  if (frontmatterEnd < 0) {
    throw new DomainError("CLI_OPERATION_FAILED", "Invalid SKILL.md frontmatter: missing closing ---");
  }

  return {
    frontmatterLines: lines.slice(1, frontmatterEnd),
    bodyLines: lines.slice(frontmatterEnd + 1),
  };
}

function parseH2Blocks(markdown: string): ParsedSkillSection[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: ParsedSkillSection[] = [];
  let currentTitle = "";
  let currentContent: string[] = [];

  const flush = (): void => {
    if (!currentTitle) {
      return;
    }
    blocks.push({ title: currentTitle, content: currentContent.join("\n").trim() });
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      flush();
      currentTitle = match[1].trim();
      currentContent = [];
      continue;
    }
    if (currentTitle) {
      currentContent.push(line);
    }
  }

  flush();
  return blocks;
}

function takeTopLevelAuthorAndVersion(frontmatterLines: string[]): { author: string; version: string } {
  let author = "";
  let version = "";
  for (let i = frontmatterLines.length - 1; i >= 0; i -= 1) {
    const rawLine = frontmatterLines[i];
    const trimmed = rawLine.trim();
    const indent = rawLine.length - rawLine.trimStart().length;
    if (indent === 0 && trimmed.startsWith("author:")) {
      if (!author) {
        author = rawLine.slice(rawLine.indexOf("author:") + "author:".length).trim();
      }
      frontmatterLines.splice(i, 1);
      continue;
    }
    if (indent === 0 && trimmed.startsWith("version:")) {
      if (!version) {
        version = rawLine.slice(rawLine.indexOf("version:") + "version:".length).trim();
      }
      frontmatterLines.splice(i, 1);
    }
  }
  return { author, version };
}

function findMetadataRange(frontmatterLines: string[]): { start: number; end: number } | undefined {
  for (let i = 0; i < frontmatterLines.length; i += 1) {
    if (frontmatterLines[i].trim() !== "metadata:") {
      continue;
    }
    let end = i;
    for (let j = i + 1; j < frontmatterLines.length; j += 1) {
      const next = frontmatterLines[j];
      const indent = next.length - next.trimStart().length;
      if (next.trim() !== "" && indent === 0) {
        break;
      }
      end = j;
    }
    return { start: i, end };
  }
  return undefined;
}
