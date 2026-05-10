export function formatPorts(ports: Record<string, number>): string {
  return Object.entries(ports)
    .map(([name, port]) => `${name}=${port}`)
    .join(", ");
}
