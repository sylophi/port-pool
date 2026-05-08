import { join, resolve } from "node:path";
import type { Config } from "../config/config";
import { loadConfig } from "../config/config";
import type { ProjectConfig } from "../config/project-config";
import { loadProjectConfigOrExit } from "../config/project-config";
import { applyEnvFile } from "../env/env";
import { renderEnv } from "../env/template";
import { formatPorts } from "../format";
import { findLeastRecentlyUsed, findNextAvailablePorts } from "../state/allocator";
import type { State } from "../state/state";
import { withState } from "../state/state";

export function performProvision(
  config: Config,
  projectConfig: ProjectConfig,
  state: State,
  resolvedDir: string,
  envPath: string,
): Record<string, number> {
  const blockSize = projectConfig.ports.length;
  let portNumbers = findNextAvailablePorts(state, config, blockSize);

  if (!portNumbers) {
    const lru = findLeastRecentlyUsed(
      state,
      (a) => Object.keys(a.ports).length === blockSize,
    );
    if (!lru) {
      console.error(
        `Error: no ports available and no recyclable allocations of size ${blockSize}`,
      );
      process.exit(1);
    }
    console.log(`Recycling ports from ${lru.dir} (least recently used)`);
    state.allocations = state.allocations.filter((a) => a.dir !== lru.dir);
    portNumbers = Object.values(lru.ports).sort((a, b) => a - b);
  }

  const ports: Record<string, number> = {};
  projectConfig.ports.forEach((name, i) => {
    ports[name] = portNumbers![i];
  });

  let rendered: Record<string, string>;
  try {
    rendered = renderEnv(projectConfig.env, ports);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  state.allocations.push({
    ports,
    dir: resolvedDir,
    timestamp: Date.now(),
  });

  applyEnvFile(envPath, rendered);

  return ports;
}

export function provision(dir: string): void {
  const resolvedDir = resolve(dir);
  const envPath = join(resolvedDir, ".env");

  const projectConfig = loadProjectConfigOrExit(resolvedDir);
  const config = loadConfig();

  withState((state) => {
    const existing = state.allocations.find((a) => a.dir === resolvedDir);
    if (existing) {
      console.log(
        `Directory already has ports allocated: ${formatPorts(existing.ports)}`,
      );
      console.log("Use 'release' first if you want new ports.");
      return;
    }
    const ports = performProvision(
      config,
      projectConfig,
      state,
      resolvedDir,
      envPath,
    );
    console.log(`Provisioned ports for ${resolvedDir}:`);
    for (const [name, port] of Object.entries(ports)) {
      console.log(`  ${name}=${port}`);
    }
  });
}
