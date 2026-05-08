import type { Config } from "../config/config";
import type { Allocation, State } from "./state";

export function isPortAvailable(
  port: number,
  state: State,
  config: Config,
): boolean {
  if (config.excludedPorts.includes(port)) return false;
  return !state.allocations.some((a) =>
    Object.values(a.ports).includes(port),
  );
}

export function findNextAvailablePorts(
  state: State,
  config: Config,
  blockSize: number,
): number[] | null {
  const candidates: number[] = [];
  for (
    let basePort = config.portRangeStart;
    basePort + blockSize - 1 <= config.portRangeEnd;
    basePort += 1
  ) {
    let allAvailable = true;
    for (let i = 0; i < blockSize; i++) {
      if (!isPortAvailable(basePort + i, state, config)) {
        allAvailable = false;
        break;
      }
    }
    if (allAvailable) candidates.push(basePort);
  }

  if (candidates.length === 0) return null;

  const basePort = candidates[Math.floor(Math.random() * candidates.length)];
  const result: number[] = [];
  for (let i = 0; i < blockSize; i++) result.push(basePort + i);
  return result;
}

export function findLeastRecentlyUsed(
  state: State,
  predicate?: (a: Allocation) => boolean,
): Allocation | null {
  const candidates = predicate
    ? state.allocations.filter(predicate)
    : state.allocations;
  if (candidates.length === 0) return null;
  return candidates.reduce((oldest, current) =>
    current.timestamp < oldest.timestamp ? current : oldest,
  );
}
