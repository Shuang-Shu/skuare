import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const SKR_PATH = resolve(__dirname, "..", "..", "skr");

test("skr keeps publish when dist help exposes publish", async () => {
  const workspace = await createFakeWorkspace({
    helpText: [
      "skuare",
      "",
      "Commands:",
      "  publish --file <request.json>      Publish from request JSON",
      "  create ...                         Deprecated alias of publish",
    ].join("\n"),
    publishOutput: "MODE=publish",
    createOutput: "MODE=create",
    createStderr: "[WARN] command 'create' is deprecated, use 'publish' instead",
  });

  try {
    const result = await execFile(workspace.scriptPath, ["publish", "--skill", "demo.md"], {
      cwd: workspace.root,
      env: { ...process.env },
    });

    assert.match(result.stdout, /MODE=publish/);
    assert.doesNotMatch(result.stderr, /Current dist does not support 'publish'/);
    assert.doesNotMatch(result.stderr, /command 'create' is deprecated/);
  } finally {
    await rm(workspace.root, { recursive: true, force: true });
  }
});

test("skr maps publish to create only when dist help lacks publish", async () => {
  const workspace = await createFakeWorkspace({
    helpText: [
      "skuare",
      "",
      "Commands:",
      "  create ...                         Deprecated alias of publish",
      "  publish-agentsmd --file <AGENTS.md> Publish AGENTS.md",
    ].join("\n"),
    publishOutput: "MODE=publish",
    createOutput: "MODE=create",
  });

  try {
    const result = await execFile(workspace.scriptPath, ["publish", "--skill", "demo.md"], {
      cwd: workspace.root,
      env: { ...process.env },
    });

    assert.match(result.stdout, /MODE=create/);
    assert.match(result.stderr, /Current dist does not support 'publish'; mapping to 'create' for compatibility\./);
  } finally {
    await rm(workspace.root, { recursive: true, force: true });
  }
});

async function createFakeWorkspace(options: {
  helpText: string;
  publishOutput: string;
  createOutput: string;
  createStderr?: string;
}): Promise<{ root: string; scriptPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "skuare-skr-test-"));
  const scriptPath = join(root, "skr");
  const cliDistDir = join(root, "skuare-cli", "dist");
  const scriptContent = await readFile(SKR_PATH, "utf8");

  await mkdir(cliDistDir, { recursive: true });
  await writeFile(scriptPath, scriptContent, "utf8");
  await chmod(scriptPath, 0o755);
  await writeFile(join(cliDistDir, ".build-stamp"), "", "utf8");
  await writeFile(
    join(cliDistDir, "index.js"),
    createFakeDistEntry({
      helpText: options.helpText,
      publishOutput: options.publishOutput,
      createOutput: options.createOutput,
      createStderr: options.createStderr,
    }),
    "utf8"
  );

  return { root, scriptPath };
}

function createFakeDistEntry(options: {
  helpText: string;
  publishOutput: string;
  createOutput: string;
  createStderr?: string;
}): string {
  return `#!/usr/bin/env node
const args = process.argv.slice(2);

if (args[0] === "help") {
  console.log(${JSON.stringify(options.helpText)});
  process.exit(0);
}

if (args[0] === "publish") {
  console.log(${JSON.stringify(options.publishOutput)});
  process.exit(0);
}

if (args[0] === "create") {
  if (${JSON.stringify(options.createStderr ?? "")}) {
    console.error(${JSON.stringify(options.createStderr ?? "")});
  }
  console.log(${JSON.stringify(options.createOutput)});
  process.exit(0);
}

console.error("UNEXPECTED:" + args.join(" "));
process.exit(1);
`;
}
