import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, maxVersion, suggestNextVersion } from "./utils/versioning";

test("compareVersions compares numeric segments numerically instead of lexically", () => {
  assert.equal(compareVersions("1.10.0", "1.2.0") > 0, true);
  assert.equal(compareVersions("2.0.0", "10.0.0") < 0, true);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
});

test("maxVersion picks the highest version from unsorted inputs", () => {
  assert.equal(maxVersion(["1.2.0", "1.10.0", "1.3.9"]), "1.10.0");
  assert.equal(maxVersion(["release-9", "release-10", "release-2"]), "release-10");
});

test("suggestNextVersion increments a trailing numeric token or appends .1", () => {
  assert.equal(suggestNextVersion("1.10.0"), "1.10.1");
  assert.equal(suggestNextVersion("release-009"), "release-010");
  assert.equal(suggestNextVersion("preview"), "preview.1");
  assert.equal(suggestNextVersion(""), "0.0.1");
});
