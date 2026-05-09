import { join, resolve } from "node:path";
import type { Config } from "../config/config";
import { loadConfig } from "../config/config";
import type { ProjectConfig } from "../config/project-config";
import { loadProjectConfigOrExit } from "../config/project-config";
import { applyEnvFile } from "../env/env";
import { renderEnvOrExit } from "../env/template";
import { formatAllocationEntry } from "../format";
import { findLeastRecentlyUsed, findNextAvailablePorts } from "../state/allocator";
import type { AllocationEntry, State } from "../state/state";
import { allocationPortCount, allocationPorts, withState } from "../state/state";

function distributePorts(
  projectConfig: ProjectConfig,
  portNumbers: number[],
): AllocationEntry[] {
  const entries: AllocationEntry[] = [];
  let cursor = 0;
  for (const cfgEntry of projectConfig) {
    const slice = portNumbers.slice(cursor, cursor + cfgEntry.portNames.length);
    cursor += cfgEntry.portNames.length;
    const ports: Record<string, number> = {};
    cfgEntry.portNames.forEach((name, i) => {
      ports[name] = slice[i];
    });
    entries.push({ envFile: cfgEntry.envFile, ports });
  }
  return entries;
}

export function performProvision(
  config: Config,
  projectConfig: ProjectConfig,
  state: State,
  resolvedDir: string,
): AllocationEntry[] {
  const blockSize = projectConfig.reduce((s, e) => s + e.portNames.length, 0);
  let portNumbers = findNextAvailablePorts(state, config, blockSize);

  if (!portNumbers) {
    const lru = findLeastRecentlyUsed(
      state,
      (a) => allocationPortCount(a) === blockSize,
    );
    if (!lru) {
      console.error(
        `Error: no ports available and no recyclable allocations of size ${blockSize}`,
      );
      process.exit(1);
    }
    console.log(`Recycling ports from ${lru.dir} (least recently used)`);
    state.allocations = state.allocations.filter((a) => a.dir !== lru.dir);
    portNumbers = allocationPorts(lru).sort((a, b) => a - b);
  }

  const entries = distributePorts(projectConfig, portNumbers);

  // Render and validate every file before any disk write so a bad template
  // doesn't leave the project half-written.
  const rendered = entries.map((entry, i) => ({
    envPath: join(resolvedDir, entry.envFile),
    contents: renderEnvOrExit(projectConfig[i].env, entry.ports),
  }));

  state.allocations.push({
    dir: resolvedDir,
    entries,
    timestamp: Date.now(),
  });

  for (const r of rendered) applyEnvFile(r.envPath, r.contents);

  return entries;
}

export function provision(dir: string): void {
  const resolvedDir = resolve(dir);

  const projectConfig = loadProjectConfigOrExit(resolvedDir);
  const config = loadConfig();

  withState((state) => {
    const existing = state.allocations.find((a) => a.dir === resolvedDir);
    if (existing) {
      console.log(`Directory already has ports allocated:`);
      for (const entry of existing.entries) {
        console.log(`  ${formatAllocationEntry(entry)}`);
      }
      console.log("Use 'release' first if you want new ports.");
      return;
    }
    const entries = performProvision(config, projectConfig, state, resolvedDir);
    console.log(`Provisioned ports for ${resolvedDir}:`);
    for (const entry of entries) {
      console.log(`  ${formatAllocationEntry(entry)}`);
    }
  });
}
