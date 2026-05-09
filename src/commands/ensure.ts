import { join, resolve } from "node:path";
import { loadConfig } from "../config/config";
import type { ProjectConfig } from "../config/project-config";
import { loadProjectConfigOrExit } from "../config/project-config";
import { applyEnvFile, diffEnv } from "../env/env";
import { renderEnvOrExit } from "../env/template";
import { formatAllocationEntry } from "../format";
import type { Allocation, AllocationEntry } from "../state/state";
import { entriesByFile, loadState, withState } from "../state/state";
import { performProvision } from "./provision";

export interface EnsureOptions {
  checkOnly: boolean;
}

interface EntryDrift {
  envFile: string;
  envPath: string;
  driftedKeys: string[];
  expected: Record<string, string>;
}

function shapeMatches(
  allocMap: Map<string, AllocationEntry>,
  projectConfig: ProjectConfig,
): boolean {
  if (allocMap.size !== projectConfig.length) return false;
  for (const cfgEntry of projectConfig) {
    const allocEntry = allocMap.get(cfgEntry.envFile);
    if (!allocEntry) return false;
    const cfgPorts = [...cfgEntry.portNames].sort();
    const allocPorts = Object.keys(allocEntry.ports).sort();
    if (cfgPorts.length !== allocPorts.length) return false;
    if (!cfgPorts.every((n, j) => n === allocPorts[j])) return false;
  }
  return true;
}

function findDrift(
  resolvedDir: string,
  projectConfig: ProjectConfig,
  allocMap: Map<string, AllocationEntry>,
): EntryDrift[] {
  const drifts: EntryDrift[] = [];
  for (const cfgEntry of projectConfig) {
    const allocEntry = allocMap.get(cfgEntry.envFile);
    if (!allocEntry) continue;
    const expected = renderEnvOrExit(cfgEntry.env, allocEntry.ports);
    const envPath = join(resolvedDir, cfgEntry.envFile);
    const driftedKeys = diffEnv(envPath, expected);
    if (driftedKeys.length > 0) {
      drifts.push({ envFile: cfgEntry.envFile, envPath, driftedKeys, expected });
    }
  }
  return drifts;
}

function repairDrift(drifts: EntryDrift[]): void {
  for (const d of drifts) {
    applyEnvFile(d.envPath, d.expected);
  }
}

export function ensure(dir: string, opts: EnsureOptions): void {
  const resolvedDir = resolve(dir);
  const projectConfig = loadProjectConfigOrExit(resolvedDir);

  const allocation: Allocation | undefined = loadState().allocations.find(
    (a) => a.dir === resolvedDir,
  );

  if (!allocation) {
    if (opts.checkOnly) {
      console.error(`not provisioned: ${resolvedDir}`);
      process.exit(1);
    }
    const config = loadConfig();
    withState((state) => {
      const recheck = state.allocations.find((a) => a.dir === resolvedDir);
      if (recheck) return;
      const entries = performProvision(config, projectConfig, state, resolvedDir);
      console.log(`Provisioned ports for ${resolvedDir}:`);
      for (const entry of entries) {
        console.log(`  ${formatAllocationEntry(entry)}`);
      }
    });
    return;
  }

  const allocMap = entriesByFile(allocation);
  if (!shapeMatches(allocMap, projectConfig)) {
    console.error(
      `config shape changed; run 'port-pool release ${resolvedDir}' then 'port-pool ensure ${resolvedDir}'`,
    );
    process.exit(1);
  }

  const drifts = findDrift(resolvedDir, projectConfig, allocMap);
  if (drifts.length === 0) return;

  if (opts.checkOnly) {
    for (const d of drifts) {
      console.error(`drift: ${resolvedDir}: ${d.envFile}: ${d.driftedKeys.join(", ")}`);
    }
    process.exit(1);
  }

  repairDrift(drifts);
  for (const d of drifts) {
    console.log(`Repaired ${d.envFile}: ${d.driftedKeys.join(", ")}`);
  }
}
