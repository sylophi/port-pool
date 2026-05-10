import { join, resolve } from "node:path";
import type { Config } from "../config/config";
import { loadConfig } from "../config/config";
import type { ProjectConfig } from "../config/project-config";
import { loadProjectConfigOrExit } from "../config/project-config";
import { applyEnvFile } from "../env/env";
import { renderEnvOrExit } from "../env/template";
import { formatPorts } from "../format";
import { findLeastRecentlyUsed, findNextAvailablePorts } from "../state/allocator";
import type { State } from "../state/state";
import { allocationPortCount, allocationPorts, withState } from "../state/state";

function buildPortMap(
  projectConfig: ProjectConfig,
  portNumbers: number[],
): Record<string, number> {
  const ports: Record<string, number> = {};
  projectConfig.portNames.forEach((name, i) => {
    ports[name] = portNumbers[i];
  });
  return ports;
}

export function performProvision(
  config: Config,
  projectConfig: ProjectConfig,
  state: State,
  resolvedDir: string,
): Record<string, number> {
  const blockSize = projectConfig.portNames.length;
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

  const ports = buildPortMap(projectConfig, portNumbers);

  // Render and validate every file before any disk write so a bad template
  // doesn't leave the project half-written.
  const writes = Object.entries(projectConfig.envFiles).map(([envFile, env]) => ({
    envPath: join(resolvedDir, envFile),
    contents: renderEnvOrExit(env, ports),
  }));

  state.allocations.push({
    dir: resolvedDir,
    ports,
    timestamp: Date.now(),
  });

  for (const w of writes) applyEnvFile(w.envPath, w.contents);

  return ports;
}

export function provision(dir: string): void {
  const resolvedDir = resolve(dir);

  const projectConfig = loadProjectConfigOrExit(resolvedDir);
  const config = loadConfig();

  withState((state) => {
    const existing = state.allocations.find((a) => a.dir === resolvedDir);
    if (existing) {
      console.log(`Directory already has ports allocated: ${formatPorts(existing.ports)}`);
      console.log("Use 'release' first if you want new ports.");
      return;
    }
    const ports = performProvision(config, projectConfig, state, resolvedDir);
    console.log(`Provisioned ports for ${resolvedDir}: ${formatPorts(ports)}`);
  });
}
