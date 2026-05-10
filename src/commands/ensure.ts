import { join, resolve } from "node:path";
import { loadConfig } from "../config/config";
import type { ProjectConfig } from "../config/project-config";
import { loadProjectConfigOrExit } from "../config/project-config";
import { applyEnvFile, diffEnv } from "../env/env";
import { renderEnvOrExit } from "../env/template";
import { formatPorts } from "../format";
import type { Allocation } from "../state/state";
import { loadState, withState } from "../state/state";
import { performProvision } from "./provision";

export interface EnsureOptions {
  checkOnly: boolean;
}

interface FileDrift {
  envFile: string;
  envPath: string;
  driftedKeys: string[];
  expected: Record<string, string>;
}

function shapeMatches(
  allocation: Allocation,
  projectConfig: ProjectConfig,
): boolean {
  const allocNames = Object.keys(allocation.ports).sort();
  const cfgNames = [...projectConfig.portNames].sort();
  if (allocNames.length !== cfgNames.length) return false;
  return allocNames.every((n, i) => n === cfgNames[i]);
}

function findDrift(
  resolvedDir: string,
  projectConfig: ProjectConfig,
  ports: Record<string, number>,
): FileDrift[] {
  const drifts: FileDrift[] = [];
  for (const [envFile, env] of Object.entries(projectConfig.envFiles)) {
    const expected = renderEnvOrExit(env, ports);
    const envPath = join(resolvedDir, envFile);
    const driftedKeys = diffEnv(envPath, expected);
    if (driftedKeys.length > 0) {
      drifts.push({ envFile, envPath, driftedKeys, expected });
    }
  }
  return drifts;
}

function repairDrift(drifts: FileDrift[]): void {
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
      const ports = performProvision(config, projectConfig, state, resolvedDir);
      console.log(`Provisioned ports for ${resolvedDir}: ${formatPorts(ports)}`);
    });
    return;
  }

  if (!shapeMatches(allocation, projectConfig)) {
    console.error(
      `config shape changed; run 'port-pool release ${resolvedDir}' then 'port-pool ensure ${resolvedDir}'`,
    );
    process.exit(1);
  }

  const drifts = findDrift(resolvedDir, projectConfig, allocation.ports);
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
