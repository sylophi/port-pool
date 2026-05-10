export function getSchemaVersionError(
  raw: unknown,
  path: string,
  expected: number,
): string | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const obj = raw as { schemaVersion?: unknown };
  if (!("schemaVersion" in obj)) {
    return (
      `${path} is missing the "schemaVersion" field.\n` +
      `Add "schemaVersion": ${expected} to the file. ` +
      `See https://github.com/sylophi/port-pool/releases for migration notes.`
    );
  }
  if (obj.schemaVersion !== expected) {
    return (
      `${path} declares schemaVersion: ${JSON.stringify(obj.schemaVersion)}, ` +
      `but this port-pool requires schemaVersion: ${expected}.\n` +
      `See https://github.com/sylophi/port-pool/releases for migration notes.`
    );
  }
  return null;
}

export function checkSchemaVersionOrExit(
  raw: unknown,
  path: string,
  expected: number,
): void {
  const err = getSchemaVersionError(raw, path, expected);
  if (err !== null) {
    console.error(`Error: ${err}`);
    process.exit(1);
  }
}
