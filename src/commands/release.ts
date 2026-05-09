import { resolve } from "node:path";
import { formatAllocationEntry } from "../format";
import { withState } from "../state/state";

export function release(dir: string): void {
  const resolvedDir = resolve(dir);

  withState((state) => {
    const idx = state.allocations.findIndex((a) => a.dir === resolvedDir);
    if (idx === -1) {
      console.log("No allocation found for this directory");
      return;
    }
    const removed = state.allocations.splice(idx, 1)[0];
    console.log(`Released allocation for ${resolvedDir}:`);
    for (const entry of removed.entries) {
      console.log(`  ${formatAllocationEntry(entry)}`);
    }
  });
}
