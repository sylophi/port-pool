export function formatPorts(ports: Record<string, number>): string {
  return Object.entries(ports)
    .map(([name, port]) => `${name}=${port}`)
    .join(", ");
}

export function formatAllocationEntry(entry: {
  envFile: string;
  ports: Record<string, number>;
}): string {
  return `${entry.envFile}: ${formatPorts(entry.ports)}`;
}
