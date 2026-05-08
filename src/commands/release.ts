import { join, resolve } from "node:path";
import { tryLoadProjectConfigOrExit } from "../config/project-config";
import { readPortNumbersFromEnv } from "../env/env";
import { formatPorts } from "../format";
import { withState } from "../state/state";

export function release(dir: string): void {
  const resolvedDir = resolve(dir);
  const envPath = join(resolvedDir, ".env");

  withState((state) => {
    const directIndex = state.allocations.findIndex(
      (a) => a.dir === resolvedDir,
    );
    if (directIndex !== -1) {
      const removed = state.allocations.splice(directIndex, 1)[0];
      console.log(`Released ports: ${formatPorts(removed.ports)}`);
      return;
    }

    const projectConfig = tryLoadProjectConfigOrExit(resolvedDir);
    if (projectConfig === null) {
      console.log("No allocation found for this directory");
      return;
    }

    const portValues = readPortNumbersFromEnv(envPath, projectConfig);
    if (portValues === null) {
      console.log("No allocation found for this directory");
      return;
    }

    const fallbackIndex = state.allocations.findIndex((a) => {
      const aValues = Object.values(a.ports).sort((x, y) => x - y);
      return (
        aValues.length === portValues.length &&
        aValues.every((v, i) => v === portValues[i])
      );
    });

    if (fallbackIndex === -1) {
      console.log("No allocation found for this directory");
      return;
    }

    const removed = state.allocations.splice(fallbackIndex, 1)[0];
    console.log(`Released ports: ${formatPorts(removed.ports)}`);
  });
}
