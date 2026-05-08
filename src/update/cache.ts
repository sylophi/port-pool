import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
const CACHE_FILE = join(dataHome, "port-pool", "update-check.json");

const CacheSchema = z.object({
  lastCheck: z.number().int().nonnegative(),
  latestVersion: z.string(),
});

export type UpdateCache = z.infer<typeof CacheSchema>;

export function loadUpdateCache(): UpdateCache | null {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    const result = CacheSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function saveUpdateCache(cache: UpdateCache): void {
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}
