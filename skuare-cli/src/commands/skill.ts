import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { BaseCommand } from "./base";
import type { CommandContext } from "./types";
import { APP_VERSION } from "../app_meta";
import { buildSkuareSkillFiles, SKUARE_SKILL_AUTHOR } from "../embedded/skuare_skill";

export class SkillCommand extends BaseCommand {
  readonly name = "skill";
  readonly description = "Install the embedded skuare skill into cwd";

  async execute(context: CommandContext): Promise<void> {
    if (context.args.length > 0) {
      this.fail("Usage: skuare skill");
    }

    const targetDir = resolve(context.cwd);
    const skillName = basename(targetDir);
    const files = buildSkuareSkillFiles(skillName);
    const installed: string[] = [];
    const unchanged: string[] = [];

    for (const file of files) {
      const targetPath = join(targetDir, file.path);
      const existing = await readFile(targetPath, "utf8").catch(() => undefined);
      if (existing !== undefined) {
        if (existing !== file.content) {
          this.fail(`Embedded skuare skill conflicts with existing file: ${targetPath}`);
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
}
