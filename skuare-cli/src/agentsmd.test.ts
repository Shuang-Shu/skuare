import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DetailCommand, GetCommand, ListCommand, PeekCommand } from "./commands/query";
import type { CommandContext, JsonValue } from "./commands/types";
import { DeleteCommand, PublishCommand } from "./commands/write";

test("list --type agmd applies regex filtering", async () => {
  const restore = mockRoutes({
    "GET /api/v1/agentsmd": jsonResponse({
      items: [
        { id: "team/agents@1.0.0", agentsmd_id: "team/agents", version: "1.0.0" },
        { id: "platform/root@1.0.0", agentsmd_id: "platform/root", version: "1.0.0" },
      ],
    }),
  });

  try {
    const logs = await captureConsole(async () => {
      await new ListCommand().execute(createContext(process.cwd(), ["--type", "agmd", "--rgx", "^team/"]));
    });
    const output = JSON.parse(logs.join("\n")) as { items: Array<{ id: string }> };
    assert.deepEqual(output.items, [{ id: "team/agents@1.0.0", agentsmd_id: "team/agents", version: "1.0.0" }]);
  } finally {
    restore();
  }
});

test("peek --type agentsmd prints response once without duplicated callApi output", async () => {
  const restore = mockRoutes({
    "GET /api/v1/agentsmd/team%2Fagents/1.0.0": jsonResponse({
      id: "team/agents@1.0.0",
      agentsmd_id: "team/agents",
      version: "1.0.0",
      content: "# AGENTS",
    }),
  });

  try {
    const logs = await captureConsole(async () => {
      await new PeekCommand().execute(createContext(process.cwd(), ["--type", "agentsmd", "team/agents", "1.0.0"]));
    });
    assert.equal(logs.length, 1);
    assert.match(logs[0], /team\/agents@1\.0\.0/);
  } finally {
    restore();
  }
});

test("get --type agmd installs AGENTS.md into workspace tool root", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-agmd-"));
  const restore = mockRoutes({
    "GET /api/v1/agentsmd/team%2Fagents": jsonResponse({ versions: ["1.0.0"] }),
    "GET /api/v1/agentsmd/team%2Fagents/1.0.0": jsonResponse({ content: "# Team Agents\n" }),
  });

  try {
    await mkdir(join(workspace, ".codex"), { recursive: true });
    await new GetCommand().execute(createContext(workspace, ["--type", "agmd", "team/agents"]));
    const installed = await readFile(join(workspace, ".codex", "AGENTS.md"), "utf8");
    assert.equal(installed, "# Team Agents\n");
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("detail --type agentsmd prints local AGENTS.md content", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-detail-agmd-"));

  try {
    await mkdir(join(workspace, ".codex"), { recursive: true });
    await writeFile(join(workspace, ".codex", "AGENTS.md"), "# Team Agents\n", "utf8");

    const output = await captureStdout(async () => {
      await new DetailCommand().execute(createContext(workspace, ["--type", "agentsmd"]));
    });

    assert.equal(output, "# Team Agents\n");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("publish --type agentsmd posts AGENTS.md payload", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "skuare-publish-agmd-"));
  const filePath = join(workspace, "AGENTS.md");
  const requestBodies: JsonValue[] = [];

  await writeFile(filePath, "# Team Agents\n", "utf8");
  const restore = mockFetch(async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as JsonValue);
    return jsonResponse({ id: "team/agents@1.0.0" }, 201);
  });

  try {
    const logs = await captureConsole(async () => {
      await new PublishCommand().execute(createContext(workspace, [
        "--type",
        "agentsmd",
        "--file",
        filePath,
        "--agentsmd-id",
        "team/agents",
        "--version",
        "1.0.0",
      ]));
    });

    assert.deepEqual(requestBodies, [{
      agentsmd_id: "team/agents",
      version: "1.0.0",
      content: "# Team Agents\n",
    }]);
    assert.match(logs.join("\n"), /Published team\/agents@1\.0\.0/);
  } finally {
    restore();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("delete --type agmd deletes AGENTS.md version", async () => {
  const requests: string[] = [];
  const restore = mockFetch(async (input, init) => {
    const url = new URL(String(input));
    requests.push(`${String(init?.method || "GET").toUpperCase()} ${url.pathname}`);
    return jsonResponse({}, 200);
  });

  try {
    const logs = await captureConsole(async () => {
      await new DeleteCommand().execute(createContext(process.cwd(), ["--type", "agmd", "team/agents", "1.0.0"]));
    });

    assert.deepEqual(requests, ["DELETE /api/v1/agentsmd/team%2Fagents/1.0.0"]);
    assert.match(logs.join("\n"), /Deleted team\/agents@1\.0\.0/);
  } finally {
    restore();
  }
});

function createContext(cwd: string, args: string[]): CommandContext {
  return {
    server: "http://127.0.0.1:15657",
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockRoutes(routes: Record<string, Response>): () => void {
  return mockFetch(async (input, init) => {
    const url = new URL(String(input));
    const key = `${String(init?.method || "GET").toUpperCase()} ${url.pathname}`;
    const response = routes[key];
    if (!response) {
      throw new Error(`Unexpected request: ${key}`);
    }
    return response.clone();
  });
}

function mockFetch(
  impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return () => {
    globalThis.fetch = original;
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

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let output = "";
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
}
