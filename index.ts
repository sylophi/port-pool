#!/usr/bin/env bun

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, "config.json");
const STATE_FILE = join(__dirname, "state.json");

interface PortConfig {
  name: string;
  envVars: string[];
  urlEnvVars?: string[];
  urlTemplate?: string;
}

interface Config {
  portRangeStart: number;
  portRangeEnd: number;
  excludedPorts: number[];
  ports: PortConfig[];
}

interface Allocation {
  ports: Record<string, number>;
  dir: string;
  timestamp: number;
}

interface State {
  allocations: Allocation[];
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    console.error(`Error: config.json not found. Copy config.example.json to config.json and customize it.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

function loadState(): State {
  if (!existsSync(STATE_FILE)) {
    return { allocations: [] };
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}

function saveState(state: State): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function isPortAvailable(port: number, state: State, config: Config): boolean {
  if (config.excludedPorts.includes(port)) return false;
  return !state.allocations.some((a) =>
    Object.values(a.ports).includes(port)
  );
}

function findNextAvailablePorts(state: State, config: Config): Record<string, number> | null {
  const portCount = config.ports.length;

  // Build list of available port blocks
  const available: number[] = [];
  for (let basePort = config.portRangeStart; basePort <= config.portRangeEnd; basePort += portCount) {
    const ports: number[] = [];
    let allAvailable = true;

    for (let i = 0; i < portCount; i++) {
      const port = basePort + i;
      if (port > config.portRangeEnd || !isPortAvailable(port, state, config)) {
        allAvailable = false;
        break;
      }
      ports.push(port);
    }

    if (allAvailable && ports.length === portCount) {
      available.push(basePort);
    }
  }

  if (available.length === 0) return null;

  // Pick randomly from available ports
  const basePort = available[Math.floor(Math.random() * available.length)];

  // Build the ports record
  const result: Record<string, number> = {};
  config.ports.forEach((portConfig, index) => {
    result[portConfig.name] = basePort + index;
  });

  return result;
}

function findLeastRecentlyUsed(state: State): Allocation | null {
  if (state.allocations.length === 0) return null;
  return state.allocations.reduce((oldest, current) =>
    current.timestamp < oldest.timestamp ? current : oldest
  );
}

function updateEnvFile(envPath: string, ports: Record<string, number>, config: Config): void {
  if (!existsSync(envPath)) {
    console.error(`Error: .env file not found at ${envPath}`);
    process.exit(1);
  }

  let content = readFileSync(envPath, "utf-8");

  for (const portConfig of config.ports) {
    const port = ports[portConfig.name];

    // Update env vars for this port
    for (const envVar of portConfig.envVars) {
      const pattern = new RegExp(`^${envVar}=.*`, "m");
      if (pattern.test(content)) {
        content = content.replace(pattern, `${envVar}=${port}`);
      }
    }

    // Update URL env vars if configured
    if (portConfig.urlEnvVars && portConfig.urlTemplate) {
      const url = portConfig.urlTemplate.replace("${port}", String(port));
      for (const urlEnvVar of portConfig.urlEnvVars) {
        const pattern = new RegExp(`^${urlEnvVar}=.*`, "m");
        if (pattern.test(content)) {
          content = content.replace(pattern, `${urlEnvVar}=${url}`);
        }
      }
    }
  }

  writeFileSync(envPath, content);
}

function readPortsFromEnv(envPath: string, config: Config): Record<string, number> | null {
  if (!existsSync(envPath)) {
    return null;
  }

  const content = readFileSync(envPath, "utf-8");
  const result: Record<string, number> = {};

  for (const portConfig of config.ports) {
    let found = false;

    // Try each env var for this port
    for (const envVar of portConfig.envVars) {
      const match = content.match(new RegExp(`^${envVar}=(\\d+)`, "m"));
      if (match) {
        result[portConfig.name] = parseInt(match[1], 10);
        found = true;
        break;
      }
    }

    if (!found) {
      return null; // Missing a required port
    }
  }

  return result;
}

function formatPorts(ports: Record<string, number>): string {
  return Object.entries(ports)
    .map(([name, port]) => `${name}=${port}`)
    .join(", ");
}

function formatPortsShort(ports: Record<string, number>): string {
  return Object.values(ports).join("/");
}

function provision(dir: string): void {
  const config = loadConfig();
  const resolvedDir = resolve(dir);
  const envPath = join(resolvedDir, ".env");
  const state = loadState();

  // Check if this directory already has an allocation
  const existing = state.allocations.find((a) => a.dir === resolvedDir);
  if (existing) {
    console.log(`Directory already has ports allocated: ${formatPorts(existing.ports)}`);
    console.log("Use 'release' first if you want new ports.");
    return;
  }

  // Try to find available ports
  let ports = findNextAvailablePorts(state, config);

  if (!ports) {
    // All ports used, recycle least recently used
    const lru = findLeastRecentlyUsed(state);
    if (!lru) {
      console.error("Error: No ports available and no allocations to recycle");
      process.exit(1);
    }
    console.log(`Recycling ports from ${lru.dir} (least recently used)`);
    // Remove the old allocation
    state.allocations = state.allocations.filter((a) => a.dir !== lru.dir);
    ports = lru.ports;
  }

  // Add new allocation
  state.allocations.push({
    ports,
    dir: resolvedDir,
    timestamp: Date.now(),
  });

  // Update .env file
  updateEnvFile(envPath, ports, config);
  saveState(state);

  console.log(`Provisioned ports for ${resolvedDir}:`);
  for (const portConfig of config.ports) {
    const envVarDisplay = portConfig.envVars[0];
    console.log(`  ${envVarDisplay}=${ports[portConfig.name]}`);
  }
}

function release(dir: string): void {
  const config = loadConfig();
  const resolvedDir = resolve(dir);
  const envPath = join(resolvedDir, ".env");
  const state = loadState();

  // Read ports from .env to confirm
  const ports = readPortsFromEnv(envPath, config);

  // Find and remove allocation
  const index = state.allocations.findIndex((a) => a.dir === resolvedDir);

  if (index === -1) {
    // Try to find by ports if dir doesn't match
    if (ports) {
      const byPorts = state.allocations.findIndex((a) => {
        const aPortValues = Object.values(a.ports).sort();
        const portValues = Object.values(ports).sort();
        return (
          aPortValues.length === portValues.length &&
          aPortValues.every((v, i) => v === portValues[i])
        );
      });
      if (byPorts !== -1) {
        const removed = state.allocations.splice(byPorts, 1)[0];
        saveState(state);
        console.log(`Released ports: ${formatPorts(removed.ports)}`);
        return;
      }
    }
    console.log("No allocation found for this directory");
    return;
  }

  const removed = state.allocations.splice(index, 1)[0];
  saveState(state);
  console.log(`Released ports: ${formatPorts(removed.ports)}`);
}

function list(): void {
  const config = loadConfig();
  const state = loadState();
  if (state.allocations.length === 0) {
    console.log("No ports currently allocated");
    return;
  }

  // Get first port name for sorting
  const firstPortName = config.ports[0]?.name;

  console.log("Current allocations:");
  const sorted = firstPortName
    ? state.allocations.sort((x, y) => (x.ports[firstPortName] ?? 0) - (y.ports[firstPortName] ?? 0))
    : state.allocations;

  for (const a of sorted) {
    const date = new Date(a.timestamp).toLocaleString();
    console.log(`  ${formatPortsShort(a.ports)} -> ${a.dir} (${date})`);
  }
}

// CLI
const [command, arg] = process.argv.slice(2);

switch (command) {
  case "provision":
    if (!arg) {
      console.error("Usage: port-pool provision <directory>");
      process.exit(1);
    }
    provision(arg);
    break;
  case "release":
    if (!arg) {
      console.error("Usage: port-pool release <directory>");
      process.exit(1);
    }
    release(arg);
    break;
  case "list":
    list();
    break;
  default:
    console.log("Usage: port-pool <command> [directory]");
    console.log("");
    console.log("Commands:");
    console.log("  provision <dir>  Allocate ports and update .env in directory");
    console.log("  release <dir>    Release ports used by directory");
    console.log("  list             Show all current allocations");
    process.exit(command ? 1 : 0);
}
