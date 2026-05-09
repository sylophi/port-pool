import type { Config } from "../config/config";
import { allocationPorts } from "./state";
import type { Allocation, State } from "./state";

export function findNextAvailablePorts(
  state: State,
  config: Config,
  blockSize: number,
): number[] | null {
  const used = new Set<number>(config.excludedPorts);
  for (const a of state.allocations) {
    for (const p of allocationPorts(a)) used.add(p);
  }

  const candidates: number[] = [];
  for (
    let basePort = config.portRangeStart;
    basePort + blockSize - 1 <= config.portRangeEnd;
    basePort += 1
  ) {
    let allAvailable = true;
    for (let i = 0; i < blockSize; i++) {
      if (used.has(basePort + i)) {
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
