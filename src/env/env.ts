import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ProjectConfig } from "../config/project-config";

const PURE_PORT_TEMPLATE_RE = /^\$\{ports\.([a-zA-Z_][a-zA-Z0-9_]*)\}$/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyEnvFile(
  envPath: string,
  rendered: Record<string, string>,
): void {
  let content = "";
  if (existsSync(envPath)) {
    content = readFileSync(envPath, "utf-8");
  }

  for (const [key, value] of Object.entries(rendered)) {
    const pattern = new RegExp(`^${escapeRegex(key)}=.*`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, () => `${key}=${value}`);
    } else {
      if (content.length > 0 && !content.endsWith("\n")) {
        content += "\n";
      }
      content += `${key}=${value}\n`;
    }
  }

  writeFileSync(envPath, content);
}

export function readPortNumbersFromEnv(
  envPath: string,
  projectConfig: ProjectConfig,
): number[] | null {
  if (!existsSync(envPath)) return null;
  const content = readFileSync(envPath, "utf-8");
  const numbers = new Set<number>();

  let foundAny = false;
  for (const [envKey, template] of Object.entries(projectConfig.env)) {
    if (!PURE_PORT_TEMPLATE_RE.test(template)) continue;
    foundAny = true;
    const match = content.match(
      new RegExp(`^${escapeRegex(envKey)}=(\\d+)$`, "m"),
    );
    if (!match) return null;
    numbers.add(parseInt(match[1], 10));
  }

  if (!foundAny) return null;
  return Array.from(numbers).sort((a, b) => a - b);
}

export function diffEnv(
  envPath: string,
  expected: Record<string, string>,
): string[] {
  const content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const drifted: string[] = [];
  for (const [key, value] of Object.entries(expected)) {
    const m = content.match(new RegExp(`^${escapeRegex(key)}=(.*)$`, "m"));
    if (!m || m[1] !== value) {
      drifted.push(key);
    }
  }
  return drifted;
}
