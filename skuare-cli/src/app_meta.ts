import { readFileSync } from "node:fs";
import { join } from "node:path";

export const APP_NAME = "skuare";
export const APP_VERSION = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).version as string;
