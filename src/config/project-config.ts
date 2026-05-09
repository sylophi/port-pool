import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { findPortReferences } from "../env/template";

const PORT_NAME = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
    message: "must match /^[a-zA-Z_][a-zA-Z0-9_]*$/",
  });

const ENV_FILE = z
  .string()
  .min(1, { message: "must be a non-empty string" })
  .refine((p) => !p.split(/[\\/]/).includes(".."), {
    message: "must not contain '..' segments",
  })
  .refine((p) => !p.startsWith("/"), {
    message: "must be a relative path",
  });

const EntrySchema = z
  .object({
    envFile: ENV_FILE,
    portNames: z
      .array(PORT_NAME)
      .min(1, { message: "must be a non-empty array" })
      .refine((xs) => new Set(xs).size === xs.length, {
        message: "port names must be unique within entry",
      }),
    env: z.record(z.string(), z.string()),
  })
  .superRefine((entry, ctx) => {
    const declared = new Set(entry.portNames);
    for (const [key, template] of Object.entries(entry.env)) {
      for (const ref of findPortReferences(template)) {
        if (!declared.has(ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["env", key],
            message: `references unknown port '${ref}' (not declared in this entry's portNames)`,
          });
        }
      }
    }
  });

export const ProjectConfigSchema = z
  .array(EntrySchema)
  .min(1, { message: "must be a non-empty array of entries" })
  .superRefine((entries, ctx) => {
    const seen = new Map<string, number>();
    entries.forEach((entry, i) => {
      const prev = seen.get(entry.envFile);
      if (prev !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "envFile"],
          message: `duplicate envFile '${entry.envFile}' (also at index ${prev})`,
        });
      } else {
        seen.set(entry.envFile, i);
      }
    });
  });

export type ProjectConfigEntry = z.infer<typeof EntrySchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

function formatZodIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("\n");
}

export function loadProjectConfig(dir: string): ProjectConfig {
  const path = join(dir, "port-pool.config.json");
  if (!existsSync(path)) {
    throw new Error(`port-pool.config.json not found at ${path}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${(err as Error).message}`);
  }
  const result = ProjectConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid ${path}:\n${formatZodIssues(result.error)}`);
  }
  return result.data;
}

export function tryLoadProjectConfig(dir: string): ProjectConfig | null {
  const path = join(dir, "port-pool.config.json");
  if (!existsSync(path)) return null;
  return loadProjectConfig(dir);
}

export function loadProjectConfigOrExit(dir: string): ProjectConfig {
  try {
    return loadProjectConfig(dir);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

export function tryLoadProjectConfigOrExit(dir: string): ProjectConfig | null {
  try {
    return tryLoadProjectConfig(dir);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
