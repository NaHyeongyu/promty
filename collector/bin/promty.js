#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(packageRoot, "src", "cli.py");
const python = process.env.PROMTY_PYTHON || (process.platform === "win32" ? "python" : "python3");
const result = spawnSync(python, [cliPath, ...process.argv.slice(2)], { stdio: "inherit" });

if (result.error) {
  console.error(`Unable to start Promty with ${python}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
