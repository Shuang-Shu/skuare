import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { BaseCommand } from "./base";
import type { CommandContext } from "./types";
import { APP_VERSION } from "../app_meta";

const SKUARE_SKILL_AUTHOR = "skuare";
const TEMPLATE_NAME_TOKEN = "__SKUARE_SKILL_NAME__";
const TEMPLATE_VERSION_TOKEN = "__SKUARE_APP_VERSION__";
const TEMPLATE_AUTHOR_TOKEN = "__SKUARE_SKILL_AUTHOR__";

type SkillTemplateFile = {
  path: string;
  content: string;
};

export class SkillCommand extends BaseCommand {
  readonly name = "skill";
  readonly description = "Install the default skuare skill template into cwd";

  async execute(context: CommandContext): Promise<void> {
    if (context.args.length > 0) {
      this.fail("Usage: skuare skill");
    }

    const targetDir = resolve(context.cwd);
    const skillName = basename(targetDir);
    const files = await this.loadDefaultSkillTemplate(skillName);
    const installed: string[] = [];
    const unchanged: string[] = [];

    for (const file of files) {
      const targetPath = join(targetDir, file.path);
      const existing = await readFile(targetPath, "utf8").catch(() => undefined);
      if (existing !== undefined) {
        if (existing !== file.content) {
          this.fail(`Default skuare skill template conflicts with existing file: ${targetPath}`);
        }
        unchanged.push(targetPath);
        continue;
      }
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.content, "utf8");
      installed.push(targetPath);
    }

    console.log(JSON.stringify({
      skill: skillName,
      author: SKUARE_SKILL_AUTHOR,
      version: APP_VERSION,
      target_dir: targetDir,
      installed,
      unchanged,
    }, null, 2));
  }

  private async loadDefaultSkillTemplate(skillName: string): Promise<SkillTemplateFile[]> {
    const templateRoot = resolve(__dirname, "..", "..", "skills", "default");
    const files = await this.collectTemplateFiles(templateRoot);
    return Promise.all(files.map(async (absolutePath) => ({
      path: relative(templateRoot, absolutePath).replace(/\\/g, "/"),
      content: this.renderTemplate(await readFile(absolutePath, "utf8"), skillName),
    })));
  }

  private async collectTemplateFiles(rootDir: string): Promise<string[]> {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      const absolutePath = join(rootDir, entry.name);
      if (entry.isDirectory()) {
        out.push(...await this.collectTemplateFiles(absolutePath));
        continue;
      }
      if (entry.isFile()) {
        out.push(absolutePath);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  private renderTemplate(content: string, skillName: string): string {
    return content
      .replaceAll(TEMPLATE_NAME_TOKEN, skillName)
      .replaceAll(TEMPLATE_VERSION_TOKEN, APP_VERSION)
      .replaceAll(TEMPLATE_AUTHOR_TOKEN, SKUARE_SKILL_AUTHOR);
  }
}
