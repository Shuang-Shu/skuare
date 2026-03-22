import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const SKR_PATH = resolve(__dirname, "..", "..", "skr");

test("skr keeps remote publish when dist help exposes remote", async () => {
  const workspace = await createFakeWorkspace({
    helpText: [
      "skuare",
      "",
      "Commands:",
      "  remote <publish|update|create|delete>  Run remote write operations",
    ].join("\n"),
    remotePublishOutput: "MODE=remote-publish",
    publishOutput: "MODE=publish",
    createOutput: "MODE=create",
    createStderr: "[WARN] command 'create' is deprecated, use 'publish' instead",
  });

  try {
    const result = await execFile(workspace.scriptPath, ["remote", "publish", "--skill", "demo.md"], {
      cwd: workspace.root,
      env: { ...process.env },
    });

    assert.match(result.stdout, /MODE=remote-publish/);
    assert.doesNotMatch(result.stderr, /Current dist does not support 'remote'/);
  } finally {
    await rm(workspace.root, { recursive: true, force: true });
  }
});

test("skr maps remote publish to publish when dist help lacks remote", async () => {
  const workspace = await createFakeWorkspace({
    helpText: [
      "skuare",
      "",
      "Commands:",
      "  publish --file <request.json>      Publish from request JSON",
    ].join("\n"),
    remotePublishOutput: "MODE=remote-publish",
    publishOutput: "MODE=publish",
    createOutput: "MODE=create",
  });

  try {
    const result = await execFile(workspace.scriptPath, ["remote", "publish", "--skill", "demo.md"], {
      cwd: workspace.root,
      env: { ...process.env },
    });

    assert.match(result.stdout, /MODE=publish/);
    assert.match(result.stderr, /Current dist does not support 'remote'; mapping 'remote publish' to 'publish' for compatibility\./);
  } finally {
    await rm(workspace.root, { recursive: true, force: true });
  }
});

test("skr maps remote publish to create when dist lacks remote and publish", async () => {
  const workspace = await createFakeWorkspace({
    helpText: [
      "skuare",
      "",
      "Commands:",
      "  create ...                         Deprecated alias of publish",
    ].join("\n"),
    remotePublishOutput: "MODE=remote-publish",
    publishOutput: "MODE=publish",
    createOutput: "MODE=create",
  });

  try {
    const result = await execFile(workspace.scriptPath, ["remote", "publish", "--skill", "demo.md"], {
      cwd: workspace.root,
      env: { ...process.env },
    });

    assert.match(result.stdout, /MODE=create/);
    assert.match(result.stderr, /Current dist does not support 'remote'; mapping 'remote publish' to 'create' for compatibility\./);
  } finally {
    await rm(workspace.root, { recursive: true, force: true });
  }
});

async function createFakeWorkspace(options: {
  helpText: string;
  remotePublishOutput: string;
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
      remotePublishOutput: options.remotePublishOutput,
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
  remotePublishOutput: string;
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

if (args[0] === "remote" && args[1] === "publish") {
  console.log(${JSON.stringify(options.remotePublishOutput)});
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
