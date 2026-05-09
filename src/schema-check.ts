export function checkSchemaVersion(
  raw: unknown,
  path: string,
  expected: number,
): void {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return;
  }
  const obj = raw as { schemaVersion?: unknown };
  if (!("schemaVersion" in obj)) {
    console.error(
      `Error: ${path} is missing the "schemaVersion" field.\n` +
        `Add "schemaVersion": ${expected} to the file. ` +
        `See https://github.com/sylophi/port-pool/releases for migration notes.`,
    );
    process.exit(1);
  }
  if (obj.schemaVersion !== expected) {
    console.error(
      `Error: ${path} declares schemaVersion: ${JSON.stringify(obj.schemaVersion)}, ` +
        `but this port-pool requires schemaVersion: ${expected}.\n` +
        `See https://github.com/sylophi/port-pool/releases for migration notes.`,
    );
    process.exit(1);
  }
}
