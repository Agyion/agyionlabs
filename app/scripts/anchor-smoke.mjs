/** Local SEP-10 security regression fixtures; no account or network mutations. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync("npm", ["test", "--", "--run", "tests/anchor.security.test.ts"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit",
});
process.exitCode = result.status ?? 1;
