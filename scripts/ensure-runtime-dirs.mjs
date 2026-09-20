// Creates the runtime directories Delter AI needs before first boot.
// Safe to run repeatedly.
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dirs = [path.join(root, "data"), path.join(root, "data", "storage")];

for (const dir of dirs) {
  await mkdir(dir, { recursive: true });
  console.log("ensured", path.relative(root, dir) || ".");
}
