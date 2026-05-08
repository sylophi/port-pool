import { VERSION } from "../version.ts";
import { loadUpdateCache, saveUpdateCache } from "./cache.ts";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2_000;
const RELEASES_API = "https://api.github.com/repos/sylophi/port-pool/releases/latest";

function shouldCheck(): boolean {
  if (VERSION === "dev") return false;
  if (process.env.CI) return false;
  if (process.env.PORT_POOL_NO_UPDATE_CHECK) return false;
  if (!process.stderr.isTTY) return false;
  return true;
}

function isNewer(latest: string, current: string): boolean {
  const parse = (s: string) =>
    s.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

function printHint(latestVersion: string): void {
  process.stderr.write(
    `\nport-pool ${latestVersion} is available (current: ${VERSION}). Run \`port-pool update\` to install.\n`,
  );
}

async function fetchLatestVersion(): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { tag_name?: string };
    if (typeof data.tag_name !== "string") throw new Error("missing tag_name");
    return data.tag_name;
  } finally {
    clearTimeout(timer);
  }
}

export async function maybeCheckForUpdate(): Promise<void> {
  if (!shouldCheck()) return;

  const cache = loadUpdateCache();
  const now = Date.now();

  if (cache && isNewer(cache.latestVersion, VERSION)) {
    printHint(cache.latestVersion);
  }

  const cacheFresh = cache && now - cache.lastCheck < CHECK_INTERVAL_MS;
  if (cacheFresh) return;

  try {
    const latest = await fetchLatestVersion();
    saveUpdateCache({ lastCheck: now, latestVersion: latest });
  } catch {
    // Silent: network errors, timeouts, rate-limits — try again tomorrow.
  }
}
