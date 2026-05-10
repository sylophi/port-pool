import { formatPorts } from "../format";
import { allocationPorts, loadState } from "../state/state";

export function list(): void {
  const state = loadState();
  if (state.allocations.length === 0) {
    console.log("No ports currently allocated");
    return;
  }

  const sorted = [...state.allocations].sort(
    (x, y) => Math.min(...allocationPorts(x)) - Math.min(...allocationPorts(y)),
  );

  console.log("Current allocations:");
  for (const a of sorted) {
    const date = new Date(a.timestamp).toLocaleString();
    const portRange = allocationPorts(a).sort((p, q) => p - q).join("/");
    console.log(`  ${portRange} -> ${a.dir} (${date})`);
    console.log(`    ${formatPorts(a.ports)}`);
  }
}
