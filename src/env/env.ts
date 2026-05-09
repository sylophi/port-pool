import { existsSync, readFileSync, writeFileSync } from "node:fs";

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
