import { join, resolve } from "node:path";
import { loadConfig } from "../config/config";
import { loadProjectConfigOrExit } from "../config/project-config";
import { applyEnvFile, diffEnv } from "../env/env";
import { renderEnv } from "../env/template";
import { loadState, withState } from "../state/state";
import { performProvision } from "./provision";

export interface EnsureOptions {
  checkOnly: boolean;
}

export function ensure(dir: string, opts: EnsureOptions): void {
  const resolvedDir = resolve(dir);
  const envPath = join(resolvedDir, ".env");
  const projectConfig = loadProjectConfigOrExit(resolvedDir);

  const allocation = loadState().allocations.find(
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
    return;
  }

  const allocNames = Object.keys(allocation.ports).sort();
  const configNames = [...projectConfig.ports].sort();
  const shapeMatches =
    allocNames.length === configNames.length &&
    allocNames.every((n, i) => n === configNames[i]);
  if (!shapeMatches) {
    console.error(
      `config shape changed; run 'port-pool release ${resolvedDir}' then 'port-pool ensure ${resolvedDir}'`,
    );
    process.exit(1);
  }

  let expected: Record<string, string>;
  try {
    expected = renderEnv(projectConfig.env, allocation.ports);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  const drifted = diffEnv(envPath, expected);
  if (drifted.length === 0) return;

  if (opts.checkOnly) {
    console.error(`drift: ${resolvedDir}: ${drifted.join(", ")}`);
    process.exit(1);
  }

  applyEnvFile(envPath, expected);
  console.log(`Repaired .env: ${drifted.join(", ")}`);
}
