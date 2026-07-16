import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";


const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repositoryDirectory = resolve(frontendDirectory, "..");

export function runSessionHelper(...args: string[]) {
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "backend",
      "python",
      "-m",
      "scripts.create_e2e_session",
      ...args,
    ],
    {
      cwd: repositoryDirectory,
      encoding: "utf8",
    },
  ).trim();
}
