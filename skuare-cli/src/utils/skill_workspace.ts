import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export async function discoverSkillDirs(cwd: string): Promise<string[]> {
  const entries = await readdir(cwd, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = join(cwd, entry.name);
    const skillPath = join(dir, "SKILL.md");
    const info = await stat(skillPath).catch(() => undefined);
    if (info?.isFile()) {
      out.push(dir);
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}
