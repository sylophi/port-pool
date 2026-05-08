import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { lockSync } from "proper-lockfile";
import { z } from "zod";

export interface Allocation {
  ports: Record<string, number>;
  dir: string;
  timestamp: number;
}

export interface State {
  allocations: Allocation[];
}

const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
const STATE_FILE = join(dataHome, "port-pool", "state.json");

const StateSchema = z.object({
  allocations: z.array(
    z.object({
      ports: z.record(z.string(), z.number().int()),
      dir: z.string(),
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
    return { allocations: [] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch (err) {
    console.error(`Error: failed to parse ${STATE_FILE}: ${(err as Error).message}`);
    process.exit(1);
  }
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
    saveState({ allocations: [] });
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
