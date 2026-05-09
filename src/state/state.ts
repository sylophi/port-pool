import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { lockSync } from "proper-lockfile";
import { z } from "zod";
import { checkSchemaVersion } from "../schema-check";

export const STATE_SCHEMA_VERSION = 1;

export interface AllocationEntry {
  envFile: string;
  ports: Record<string, number>;
}

export interface Allocation {
  dir: string;
  entries: AllocationEntry[];
  timestamp: number;
}

export interface State {
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  allocations: Allocation[];
}

export function allocationPorts(a: Allocation): number[] {
  return a.entries.flatMap((e) => Object.values(e.ports));
}

export function allocationPortCount(a: Allocation): number {
  return a.entries.reduce((s, e) => s + Object.keys(e.ports).length, 0);
}

export function entriesByFile(a: Allocation): Map<string, AllocationEntry> {
  const map = new Map<string, AllocationEntry>();
  for (const e of a.entries) map.set(e.envFile, e);
  return map;
}

const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
const STATE_FILE = join(dataHome, "port-pool", "state.json");

const StateSchema = z.object({
  schemaVersion: z.literal(STATE_SCHEMA_VERSION),
  allocations: z.array(
    z.object({
      dir: z.string(),
      entries: z.array(
        z.object({
          envFile: z.string(),
          ports: z.record(z.string(), z.number().int()),
        }),
      ),
      timestamp: z.number().int().nonnegative(),
    }),
  ),
});

function formatZodIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("\n");
}

export function loadState(): State {
  if (!existsSync(STATE_FILE)) {
    return { schemaVersion: STATE_SCHEMA_VERSION, allocations: [] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch (err) {
    console.error(`Error: failed to parse ${STATE_FILE}: ${(err as Error).message}`);
    process.exit(1);
  }
  checkSchemaVersion(raw, STATE_FILE, STATE_SCHEMA_VERSION);
  const result = StateSchema.safeParse(raw);
  if (!result.success) {
    console.error(
      `Error: invalid ${STATE_FILE}:\n${formatZodIssues(result.error)}`,
    );
    process.exit(1);
  }
  return result.data as State;
}

export function saveState(state: State): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function ensureStateFile(): void {
  if (!existsSync(STATE_FILE)) {
    mkdirSync(join(dataHome, "port-pool"), { recursive: true });
    saveState({ schemaVersion: STATE_SCHEMA_VERSION, allocations: [] });
  }
}

const LOCK_TIMEOUT_MS = 10_000;
const POLL_MS = 100;

function lockStateFile(): () => void {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (true) {
    try {
      return lockSync(STATE_FILE, { stale: 10_000 });
    } catch (err) {
      if ((err as { code?: string }).code !== "ELOCKED") throw err;
      if (Date.now() >= deadline) throw err;
      Bun.sleepSync(POLL_MS);
    }
  }
}

export function withState(mutator: (state: State) => void): void {
  ensureStateFile();
  const release = lockStateFile();
  try {
    const state = loadState();
    mutator(state);
    saveState(state);
  } finally {
    release();
  }
}
