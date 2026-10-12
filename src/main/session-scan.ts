import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function newestSessionFile(root: string): Promise<{ file: string; mtimeMs: number; size: number } | null> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  let newest: { file: string; mtimeMs: number; size: number } | null = null;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(root, entry.name);
    const files = await readdir(dirPath).catch(() => []);
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const full = path.join(dirPath, file);
      const st = await stat(full).catch(() => null);
      if (st && (!newest || st.mtimeMs > newest.mtimeMs)) {
        newest = { file: full, mtimeMs: st.mtimeMs, size: st.size };
      }
    }
  }
  return newest;
}
