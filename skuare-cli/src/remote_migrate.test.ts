import test from "node:test";
import assert from "node:assert/strict";
import type { RegistryBackend } from "./registry/backend";
import type {
  PublishAgentsMDRequest,
  PublishSkillRequest,
  RegistryAgentsMDDetail,
  RegistryAgentsMDEntry,
  RegistryAgentsMDOverview,
  RegistryHealth,
  RegistrySkillDetail,
  RegistrySkillEntry,
  RegistrySkillOverview,
} from "./registry/types";
import { RemoteMigrateCommand } from "./commands/remote_migrate";
import type { CommandContext } from "./commands/types";
import { DomainError } from "./domain/errors";

test("remote migrate dry-run lists planned skill and agentsmd resources without writing destination", async () => {
  const destination = createStubBackend();
  const command = new RemoteMigrateCommand(
    async (server) => server === "src-server" ? createStubBackend({
      skills: [{
        skill_id: "team/demo",
        version: "1.0.0",
        name: "demo",
        author: "team",
        description: "Demo skill",
        path: "/src/team/demo/1.0.0",
        updated_at: "2026-03-22T00:00:00Z",
        files: [{ path: "SKILL.md", content: "# Demo\n" }],
      }],
      agentsmd: [{
        agentsmd_id: "team/guide",
        version: "1.0.0",
        id: "team/guide@1.0.0",
        content: "# Guide\n",
      }],
    }) : destination,
    async (_cwd, token) => token === "src" ? "src-server" : token === "dst" ? "dst-server" : token
  );

  const logs = await captureConsole(async () => {
    await command.execute(createContext(["src", "dst", "--dry-run"]));
  });
  const output = JSON.parse(logs.join("\n")) as {
    dry_run: boolean;
    migrated: unknown[];
    plan: Array<{ type: string }>;
  };

  assert.equal(output.dry_run, true);
  assert.equal(output.migrated.length, 0);
  assert.deepEqual(output.plan, [
    { type: "skill", skill_id: "team/demo", version: "1.0.0" },
    { type: "agentsmd", agentsmd_id: "team/guide", version: "1.0.0" },
  ]);
  assert.equal(destination.publishedSkills.length, 0);
  assert.equal(destination.publishedAgentsMD.length, 0);
});

test("remote migrate publishes migrated skill and agentsmd resources to destination", async () => {
  const destination = createStubBackend();
  const command = new RemoteMigrateCommand(
    async (server) => server === "src-server" ? createStubBackend({
      skills: [{
        skill_id: "team/demo",
        version: "1.0.0",
        name: "demo",
        author: "team",
        description: "Demo skill",
        path: "/src/team/demo/1.0.0",
        updated_at: "2026-03-22T00:00:00Z",
        files: [
          { path: "SKILL.md", content: "# Demo\n" },
          { path: "bin/data.bin", content: "AQID", encoding: "base64" },
        ],
      }],
      agentsmd: [{
        agentsmd_id: "team/guide",
        version: "1.0.0",
        id: "team/guide@1.0.0",
        content: "# Guide\n",
      }],
    }) : destination,
    async (_cwd, token) => token === "src" ? "src-server" : token === "dst" ? "dst-server" : token
  );

  const logs = await captureConsole(async () => {
    await command.execute(createContext(["src", "dst"]));
  });
  const output = JSON.parse(logs.join("\n")) as {
    migrated: Array<{ type: string }>;
    skipped: unknown[];
  };

  assert.deepEqual(output.migrated, [
    { type: "skill", skill_id: "team/demo", version: "1.0.0" },
    { type: "agentsmd", agentsmd_id: "team/guide", version: "1.0.0" },
  ]);
  assert.equal(output.skipped.length, 0);
  assert.equal(destination.publishedSkills.length, 1);
  assert.deepEqual(destination.publishedSkills[0], {
    skill_id: "team/demo",
    version: "1.0.0",
    files: [
      { path: "SKILL.md", content: "# Demo\n" },
      { path: "bin/data.bin", content: "AQID", encoding: "base64" },
    ],
  });
  assert.equal(destination.publishedAgentsMD.length, 1);
  assert.deepEqual(destination.publishedAgentsMD[0], {
    agentsmdID: "team/guide",
    version: "1.0.0",
    content: "# Guide\n",
  });
});

test("remote migrate --skip-existing skips existing versions and continues", async () => {
  const destination = createStubBackend({
    publishSkillError: new DomainError("SKILL_VERSION_ALREADY_EXISTS", "skill version already exists", {
      details: { status: 409 },
    }),
  });
  const command = new RemoteMigrateCommand(
    async (server) => server === "src-server" ? createStubBackend({
      skills: [{
        skill_id: "team/demo",
        version: "1.0.0",
        name: "demo",
        author: "team",
        description: "Demo skill",
        path: "/src/team/demo/1.0.0",
        updated_at: "2026-03-22T00:00:00Z",
        files: [{ path: "SKILL.md", content: "# Demo\n" }],
      }],
      agentsmd: [{
        agentsmd_id: "team/guide",
        version: "1.0.0",
        id: "team/guide@1.0.0",
        content: "# Guide\n",
      }],
    }) : destination,
    async (_cwd, token) => token === "src" ? "src-server" : token === "dst" ? "dst-server" : token
  );

  const logs = await captureConsole(async () => {
    await command.execute(createContext(["src", "dst", "--skip-existing"]));
  });
  const output = JSON.parse(logs.join("\n")) as {
    migrated: Array<{ type: string }>;
    skipped: Array<{ type: string; reason: string }>;
  };

  assert.deepEqual(output.skipped, [
    { type: "skill", skill_id: "team/demo", version: "1.0.0", reason: "already_exists" },
  ]);
  assert.deepEqual(output.migrated, [
    { type: "agentsmd", agentsmd_id: "team/guide", version: "1.0.0" },
  ]);
});

test("remote migrate resolves named sources from config resolver hook", async () => {
  let receivedSource: string | undefined;
  let receivedDestination: string | undefined;
  const command = new RemoteMigrateCommand(
    async (server) => {
      if (!receivedSource) {
        receivedSource = server;
      } else if (!receivedDestination) {
        receivedDestination = server;
      }
      return createStubBackend();
    },
    async (_cwd, token) => token === "prod" ? "https://registry.example.com" : token === "backup" ? "git+file:///tmp/backup.git" : token
  );

  await captureConsole(async () => {
    await command.execute(createContext(["prod", "backup", "--type", "skill", "--dry-run"]));
  });

  assert.equal(receivedSource, "https://registry.example.com");
  assert.equal(receivedDestination, "git+file:///tmp/backup.git");
});

function createContext(args: string[]): CommandContext {
  return {
    server: "http://127.0.0.1:15657",
    localMode: false,
    cwd: process.cwd(),
    llmTools: ["codex"],
    toolSkillDirs: {},
    auth: {
      keyId: "kid",
      privateKeyFile: "/tmp/key.pem",
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

type StubOptions = {
  skills?: RegistrySkillDetail[];
  agentsmd?: RegistryAgentsMDDetail[];
  publishSkillError?: Error;
};

type StubBackend = RegistryBackend & {
  publishedSkills: Array<Record<string, unknown>>;
  publishedAgentsMD: Array<Record<string, unknown>>;
};

function createStubBackend(options: StubOptions = {}): StubBackend {
  const skills = options.skills || [];
  const agentsmd = options.agentsmd || [];
  const publishedSkills: Array<Record<string, unknown>> = [];
  const publishedAgentsMD: Array<Record<string, unknown>> = [];

  return {
    publishedSkills,
    publishedAgentsMD,
    async health(): Promise<RegistryHealth> {
      return { status: "ok", name: "stub" };
    },
    async listSkills(): Promise<RegistrySkillEntry[]> {
      return skills.map(toSkillEntry);
    },
    async getSkillOverview(skillID: string): Promise<RegistrySkillOverview> {
      const versions = skills.filter((item) => item.skill_id === skillID).map((item) => item.version);
      return { skill_id: skillID, author: skills.find((item) => item.skill_id === skillID)?.author || "", versions };
    },
    async getSkillVersion(skillID: string, version: string): Promise<RegistrySkillDetail> {
      const detail = skills.find((item) => item.skill_id === skillID && item.version === version);
      assert.ok(detail, `Missing stub skill detail: ${skillID}@${version}`);
      return detail;
    },
    async publishSkill(request: PublishSkillRequest): Promise<RegistrySkillEntry> {
      if (options.publishSkillError) {
        throw options.publishSkillError;
      }
      assert.ok(!(request.body instanceof Uint8Array), "test stub only expects JSON body");
      const body = request.body as Record<string, unknown>;
      publishedSkills.push(body);
      return {
        skill_id: String(body.skill_id || ""),
        version: String(body.version || ""),
        name: "",
        author: "",
        description: "",
        path: "",
        updated_at: "",
      };
    },
    async deleteSkill(): Promise<void> {},
    async validateSkill(skillID: string, version: string): Promise<RegistrySkillEntry> {
      return toSkillEntry(await this.getSkillVersion(skillID, version));
    },
    async listAgentsMD(): Promise<RegistryAgentsMDEntry[]> {
      return agentsmd.map((item) => ({
        agentsmd_id: item.agentsmd_id,
        version: item.version,
        id: item.id,
        name: item.agentsmd_id,
        author: "",
        description: "",
      }));
    },
    async getAgentsMDOverview(agentsmdID: string): Promise<RegistryAgentsMDOverview> {
      return {
        agentsmd_id: agentsmdID,
        versions: agentsmd.filter((item) => item.agentsmd_id === agentsmdID).map((item) => item.version),
        ids: agentsmd.filter((item) => item.agentsmd_id === agentsmdID).map((item) => item.id),
      };
    },
    async getAgentsMDVersion(agentsmdID: string, version: string): Promise<RegistryAgentsMDDetail> {
      const detail = agentsmd.find((item) => item.agentsmd_id === agentsmdID && item.version === version);
      assert.ok(detail, `Missing stub agentsmd detail: ${agentsmdID}@${version}`);
      return detail;
    },
    async publishAgentsMD(request: PublishAgentsMDRequest): Promise<RegistryAgentsMDEntry> {
      publishedAgentsMD.push({
        agentsmdID: request.agentsmdID,
        version: request.version,
        content: request.content,
      });
      return {
        agentsmd_id: request.agentsmdID,
        version: request.version,
        id: `${request.agentsmdID}@${request.version}`,
        name: request.agentsmdID,
        author: "",
        description: "",
      };
    },
    async deleteAgentsMD(): Promise<void> {},
  };
}

function toSkillEntry(detail: RegistrySkillDetail): RegistrySkillEntry {
  return {
    skill_id: detail.skill_id,
    version: detail.version,
    name: detail.name,
    author: detail.author,
    description: detail.description,
    path: detail.path,
    updated_at: detail.updated_at,
  };
}
