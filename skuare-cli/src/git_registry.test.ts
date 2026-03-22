import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HealthCommand } from "./commands/admin";
import { GetCommand, ListCommand, PeekCommand, ValidateCommand } from "./commands/query";
import { DeleteCommand, PublishCommand, UpdateCommand } from "./commands/write";
import type { CommandContext } from "./commands/types";
import { getRegistryBackend } from "./registry/factory";

const execFileAsync = promisify(execFile);

test("git registry supports skill read and write flows", async () => {
  const repo = await createGitRegistry();
  const workspace = await mkdtemp(join(tmpdir(), "skuare-git-skill-"));
  const localSkillDir = join(workspace, "demo-skill-next");

  try {
    await seedRegistry(repo);
    await createSkillDir(localSkillDir, "demo-skill", "team", "1.1.0", "Updated from git backend");

    const healthLogs = await captureConsole(async () => {
      await new HealthCommand().execute(createContext(workspace, [], repo.server));
    });
    assert.match(healthLogs.join("\n"), /skuare-git/);

    const listLogs = await captureConsole(async () => {
      await new ListCommand().execute(createContext(workspace, ["--q", "demo-skill"], repo.server));
    });
    assert.match(listLogs.join("\n"), /"skill_id": "demo-skill"/);

    const peekLogs = await captureConsole(async () => {
      await new PeekCommand().execute(createContext(workspace, ["demo-skill", "1.0.0"], repo.server));
    });
    assert.match(peekLogs.join("\n"), /"version": "1.0.0"/);

    const validateLogs = await captureConsole(async () => {
      await new ValidateCommand().execute(createContext(workspace, ["demo-skill", "1.0.0"], repo.server));
    });
    assert.match(validateLogs.join("\n"), /"author": "team"/);

    await new GetCommand().execute(createContext(workspace, ["demo-skill", "1.0.0"], repo.server));
    const installed = await readFile(join(workspace, ".codex", "skills", "demo-skill", "SKILL.md"), "utf8");
    assert.match(installed, /name: "demo-skill"/);

    await new PublishCommand().execute(createContext(workspace, ["--dir", localSkillDir], repo.server));
    const publishedList = await captureConsole(async () => {
      await new ListCommand().execute(createContext(workspace, ["--q", "demo-skill"], repo.server));
    });
    assert.match(publishedList.join("\n"), /"version": "1.1.0"/);

    await new DeleteCommand().execute(createContext(workspace, ["demo-skill", "1.1.0"], repo.server));
    const afterDelete = await captureConsole(async () => {
      await new ListCommand().execute(createContext(workspace, ["--q", "demo-skill"], repo.server));
    });
    assert.doesNotMatch(afterDelete.join("\n"), /"version": "1.1.0"/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(repo.rootDir, { recursive: true, force: true });
  }
});

test("git registry supports update flow", async () => {
  const repo = await createGitRegistry();
  const workspace = await mkdtemp(join(tmpdir(), "skuare-git-update-"));
  const localSkillDir = join(workspace, "demo-skill-next");

  try {
    await seedRegistry(repo);
    await createSkillDir(localSkillDir, "demo-skill", "team", "1.1.0", "Updated from update command");

    await new UpdateCommand().execute(createContext(workspace, ["demo-skill", localSkillDir], repo.server));

    const peekLogs = await captureConsole(async () => {
      await new PeekCommand().execute(createContext(workspace, ["demo-skill", "1.1.0"], repo.server));
    });
    assert.match(peekLogs.join("\n"), /"version": "1.1.0"/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(repo.rootDir, { recursive: true, force: true });
  }
});

test("git registry supports agentsmd flows", async () => {
  const repo = await createGitRegistry();
  const workspace = await mkdtemp(join(tmpdir(), "skuare-git-agentsmd-"));
  const agentsFile = join(workspace, "AGENTS.md");

  try {
    await seedRegistry(repo);
    await writeFile(agentsFile, "# Team Guide v1.1\n", "utf8");

    const listLogs = await captureConsole(async () => {
      await new ListCommand().execute(createContext(workspace, ["--type", "agmd", "--q", "team/guide"], repo.server));
    });
    assert.match(listLogs.join("\n"), /team\/guide@1\.0\.0/);

    await new PublishCommand().execute(createContext(workspace, [
      "--type",
      "agmd",
      "--file",
      agentsFile,
      "--agentsmd-id",
      "team/guide",
      "--version",
      "1.1.0",
    ], repo.server));

    await new GetCommand().execute(createContext(workspace, ["--type", "agmd", "team/guide", "1.1.0"], repo.server));
    const installed = await readFile(join(workspace, ".codex", "AGENTS.md"), "utf8");
    assert.equal(installed, "# Team Guide v1.1\n");

    await new DeleteCommand().execute(createContext(workspace, ["--type", "agmd", "team/guide", "1.1.0"], repo.server));

    const afterDelete = await captureConsole(async () => {
      await new ListCommand().execute(createContext(workspace, ["--type", "agmd", "--q", "team/guide"], repo.server));
    });
    assert.doesNotMatch(afterDelete.join("\n"), /team\/guide@1\.1\.0/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(repo.rootDir, { recursive: true, force: true });
  }
});

test("git registry bulk import writes one commit for one migration bundle", async () => {
  const sourceRepo = await createGitRegistry();
  const destinationRepo = await createGitRegistry();

  try {
    await seedRegistry(sourceRepo);
    const sourceBackend = await getRegistryBackend(sourceRepo.server);
    const destinationBackend = await getRegistryBackend(destinationRepo.server);
    const bundle = await sourceBackend.exportResources("all");
    const result = await destinationBackend.importResources(bundle);

    assert.equal(result.imported.length, 2);
    await assertCommitCount(destinationRepo.remoteDir, 1);
  } finally {
    await rm(sourceRepo.rootDir, { recursive: true, force: true });
    await rm(destinationRepo.rootDir, { recursive: true, force: true });
  }
});

test("git registry bulk import skips unchanged versions without creating extra commits", async () => {
  const sourceRepo = await createGitRegistry();
  const destinationRepo = await createGitRegistry();

  try {
    await seedRegistry(sourceRepo);
    await seedRegistry(destinationRepo);
    const sourceBackend = await getRegistryBackend(sourceRepo.server);
    const destinationBackend = await getRegistryBackend(destinationRepo.server);
    const bundle = await sourceBackend.exportResources("all");
    const result = await destinationBackend.importResources(bundle);

    assert.deepEqual(result.imported, []);
    assert.deepEqual(result.skipped, [
      { type: "skill", skill_id: "demo-skill", version: "1.0.0", reason: "unchanged" },
      { type: "agentsmd", agentsmd_id: "team/guide", version: "1.0.0", reason: "unchanged" },
    ]);
    await assertCommitCount(destinationRepo.remoteDir, 1);
  } finally {
    await rm(sourceRepo.rootDir, { recursive: true, force: true });
    await rm(destinationRepo.rootDir, { recursive: true, force: true });
  }
});

async function createGitRegistry(): Promise<{ rootDir: string; remoteDir: string; server: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), "skuare-git-registry-"));
  const remoteDir = join(rootDir, "remote.git");
  await git(["init", "--bare", remoteDir], rootDir);
  return {
    rootDir,
    remoteDir,
    server: `git+${pathToFileURL(remoteDir).toString()}`,
  };
}

async function seedRegistry(repo: { rootDir: string; remoteDir: string }): Promise<void> {
  const seedDir = join(repo.rootDir, "seed");
  await git(["clone", repo.remoteDir, seedDir], repo.rootDir);

  await createSkillDir(join(seedDir, "team", "demo-skill", "1.0.0"), "demo-skill", "team", "1.0.0", "Seed skill");
  await mkdir(join(seedDir, "agentsmd", "team", "guide", "1.0.0"), { recursive: true });
  await writeFile(join(seedDir, "agentsmd", "team", "guide", "1.0.0", "AGENTS.md"), "# Team Guide v1.0\n", "utf8");
  await writeFile(
    join(seedDir, "agentsmd", "team", "guide", "1.0.0", "meta.json"),
    JSON.stringify({ agentsmd_id: "team/guide", version: "1.0.0" }, null, 2),
    "utf8"
  );

  await git(["add", "."], seedDir);
  await git(["-c", "user.name=skuare", "-c", "user.email=skuare@example.local", "commit", "-m", "seed"], seedDir);
  await git(["push", "origin", "HEAD:master"], seedDir);
}

async function createSkillDir(
  skillDir: string,
  skillID: string,
  author: string,
  version: string,
  description: string
): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    [
      "---",
      `name: "${skillID}"`,
      "metadata:",
      `  version: "${version}"`,
      `  author: "${author}"`,
      `description: "${description}"`,
      "---",
      "",
      `# ${skillID}`,
      "",
      "## Overview",
      "Demo overview",
      "",
    ].join("\n"),
    "utf8"
  );
}

function createContext(cwd: string, args: string[], server: string): CommandContext {
  return {
    server,
    localMode: true,
    cwd,
    llmTools: ["codex"],
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
    logs.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    await run();
    return logs;
  } finally {
    console.log = original;
  }
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, encoding: "utf8" });
}

async function assertCommitCount(remoteDir: string, expected: number): Promise<void> {
  const { stdout } = await execFileAsync("git", ["rev-list", "--count", "master"], {
    cwd: remoteDir,
    encoding: "utf8",
  });
  assert.equal(Number(stdout.trim()), expected);
}
