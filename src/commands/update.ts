import { chmodSync, renameSync, writeFileSync } from "node:fs";
import { VERSION } from "../version";

const REPO = "sylophi/port-pool";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const MIN_BINARY_BYTES = 1_000_000;

interface ReleaseInfo {
  tag_name: string;
}

function detectAssetSuffix(): string {
  const os =
    process.platform === "darwin" ? "darwin" :
    process.platform === "linux" ? "linux" :
    null;
  const arch =
    process.arch === "arm64" ? "arm64" :
    process.arch === "x64" ? "x64" :
    null;
  if (!os || !arch) {
    console.error(`Unsupported platform: ${process.platform}/${process.arch}`);
    process.exit(1);
  }
  return `${os}-${arch}`;
}

async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const resp = await fetch(RELEASES_API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) {
    console.error(`Failed to fetch release info: HTTP ${resp.status}`);
    process.exit(1);
  }
  return resp.json() as Promise<ReleaseInfo>;
}

export async function update(): Promise<void> {
  if (VERSION === "dev") {
    console.error(
      "Cannot update a dev build. Either run from source, or install the released binary via curl-pipe.",
    );
    process.exit(1);
  }

  const suffix = detectAssetSuffix();
  console.log("Checking for updates...");
  const release = await fetchLatestRelease();

  if (release.tag_name === VERSION) {
    console.log(`Already at latest version: ${VERSION}`);
    return;
  }

  const asset = `port-pool-${suffix}`;
  const url = `https://github.com/${REPO}/releases/download/${release.tag_name}/${asset}`;
  console.log(`Downloading ${release.tag_name} for ${suffix}...`);

  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`Download failed: HTTP ${resp.status} for ${url}`);
    process.exit(1);
  }
  const bytes = new Uint8Array(await resp.arrayBuffer());

  if (bytes.length < MIN_BINARY_BYTES) {
    console.error(
      `Downloaded file is suspiciously small (${bytes.length} bytes); aborting.`,
    );
    process.exit(1);
  }

  const currentPath = process.execPath;
  const tmpPath = `${currentPath}.update`;
  writeFileSync(tmpPath, bytes);
  chmodSync(tmpPath, 0o755);
  renameSync(tmpPath, currentPath);

  console.log(`Updated ${VERSION} -> ${release.tag_name}`);
}
