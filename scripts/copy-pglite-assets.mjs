import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pgliteDist = join(root, "node_modules", "@electric-sql", "pglite", "dist");

if (existsSync(pgliteDist)) {
  const targetDirs = [
    join(root, ".output", "server", "_libs"),
    join(root, ".output", "server"),
    join(root, ".output", "server", "_chunks"),
  ];

  for (const dir of targetDirs) {
    try {
      mkdirSync(dir, { recursive: true });
      const files = readdirSync(pgliteDist);
      for (const file of files) {
        if (
          file.endsWith(".data") ||
          file.endsWith(".wasm") ||
          file.endsWith(".tar.gz") ||
          file.startsWith("pglite")
        ) {
          copyFileSync(join(pgliteDist, file), join(dir, file));
        }
      }
    } catch (err) {
      console.warn(`[pglite-assets] warning copying to ${dir}:`, err);
    }
  }
  console.log("[pglite-assets] Copied PGlite binary assets successfully.");
} else {
  console.warn("[pglite-assets] @electric-sql/pglite dist not found at:", pgliteDist);
}
