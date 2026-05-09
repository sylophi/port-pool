import { existsSync } from "node:fs";
import { join } from "node:path";
import { formatAllocationEntry } from "../format";
import type { Allocation } from "../state/state";
import { loadState, withState } from "../state/state";

export interface PruneOptions {
  dryRun: boolean;
}

interface OrphanInfo {
  allocation: Allocation;
  reason: string;
}

function classifyOrphans(allocations: Allocation[]): OrphanInfo[] {
  const orphans: OrphanInfo[] = [];
  for (const a of allocations) {
    if (!existsSync(a.dir)) {
      orphans.push({ allocation: a, reason: "directory missing" });
      continue;
    }
    if (!existsSync(join(a.dir, "port-pool.config.json"))) {
      orphans.push({ allocation: a, reason: "no port-pool.config.json" });
    }
  }
  return orphans;
}

function reportOrphans(orphans: OrphanInfo[], verb: string): void {
  if (orphans.length === 0) {
    console.log("No orphaned allocations");
    return;
  }
  console.log(`${verb} ${orphans.length} allocation(s):`);
  for (const o of orphans) {
    console.log(`  - ${o.allocation.dir} (${o.reason})`);
    for (const entry of o.allocation.entries) {
      console.log(`    ${formatAllocationEntry(entry)}`);
    }
  }
}

export function prune(opts: PruneOptions): void {
  if (opts.dryRun) {
    reportOrphans(classifyOrphans(loadState().allocations), "Would prune");
    return;
  }

  withState((state) => {
    const orphans = classifyOrphans(state.allocations);
    if (orphans.length > 0) {
      const orphanDirs = new Set(orphans.map((o) => o.allocation.dir));
      state.allocations = state.allocations.filter((a) => !orphanDirs.has(a.dir));
    }
    reportOrphans(orphans, "Pruned");
  });
}
