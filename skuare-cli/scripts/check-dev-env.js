#!/usr/bin/env node

function fail(message) {
  console.error(`[skuare-cli] ${message}`);
  process.exit(1);
}

function requirePackage(specifier, installHint) {
  try {
    require.resolve(specifier);
  } catch {
    fail(
      `Missing ${specifier}. Run "cd skuare-cli && npm install" before build/check. ${installHint}`
    );
  }
}

const [major] = process.versions.node.split(".").map(Number);
if (!Number.isFinite(major) || major < 20) {
  fail(`Node.js >=20 is required. Current version: ${process.versions.node}`);
}

requirePackage("typescript/package.json", "TypeScript is a dev dependency of this package.");
requirePackage(
  "@types/node/package.json",
  "Node.js runtime alone does not provide TypeScript type definitions for compilerOptions.types=['node']."
);
