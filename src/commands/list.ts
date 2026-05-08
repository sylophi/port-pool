import { formatPortsShort } from "../format";
import { loadState } from "../state/state";

export function list(): void {
  const state = loadState();
  if (state.allocations.length === 0) {
    console.log("No ports currently allocated");
    return;
  }

  const sorted = [...state.allocations].sort((x, y) => {
    const xMin = Math.min(...Object.values(x.ports));
    const yMin = Math.min(...Object.values(y.ports));
    return xMin - yMin;
  });

  console.log("Current allocations:");
  for (const a of sorted) {
    const date = new Date(a.timestamp).toLocaleString();
    console.log(`  ${formatPortsShort(a.ports)} -> ${a.dir} (${date})`);
  }
}
