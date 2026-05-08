import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
const CONFIG_FILE = join(configHome, "port-pool", "config.json");

export const ConfigSchema = z
  .object({
    portRangeStart: z.number().int().positive(),
    portRangeEnd: z.number().int().positive(),
    excludedPorts: z.array(z.number().int().positive()),
  })
  .refine((c) => c.portRangeEnd >= c.portRangeStart, {
    message: "portRangeEnd must be >= portRangeStart",
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    console.error(`Error: config not found at ${CONFIG_FILE}`);
    console.error("Create it with the following starter content:\n");
    console.error(`{
  "portRangeStart": 8500,
  "portRangeEnd": 9000,
  "excludedPorts": [8888]
}`);
    process.exit(1);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch (err) {
    console.error(`Error: failed to parse ${CONFIG_FILE}: ${(err as Error).message}`);
    process.exit(1);
  }
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error(
      `Error: invalid ${CONFIG_FILE}:\n${formatZodIssues(result.error)}`,
    );
    process.exit(1);
  }
  return result.data;
}

function formatZodIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("\n");
}
