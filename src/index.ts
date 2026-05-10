#!/usr/bin/env bun

import { ensure } from "./commands/ensure";
import { list } from "./commands/list";
import { provision } from "./commands/provision";
import { prune } from "./commands/prune";
import { release } from "./commands/release";
import { setupGuide } from "./commands/setup-guide";
import { update } from "./commands/update";
import { version } from "./commands/version";
import { maybeCheckForUpdate } from "./update/check";

function printUsage(): void {
  console.log("Usage: port-pool <command> [directory]");
  console.log("");
  console.log("Commands:");
  console.log("  provision <dir>           Allocate ports and update .env in directory");
  console.log("  release <dir>             Release ports used by directory");
  console.log("  ensure <dir> [--check]    Provision if needed; repair .env drift if not");
  console.log("                            --check: read-only, exit 1 if anything would change");
  console.log("  list                      Show all current allocations");
  console.log("  prune [--dry-run]         Remove allocations whose dir or config is gone");
  console.log("  setup-guide               Print instructions for adding port-pool to a project");
  console.log("  version                   Print the installed version");
  console.log("  update                    Download and install the latest version");
  console.log("  help                      Print this help message");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const rest = argv.slice(1);

  switch (command) {
    case "provision":
      if (!rest[0]) {
        console.error("Usage: port-pool provision <directory>");
        process.exit(1);
      }
      provision(rest[0]);
      break;
    case "release":
      if (!rest[0]) {
        console.error("Usage: port-pool release <directory>");
        process.exit(1);
      }
      release(rest[0]);
      break;
    case "ensure": {
      const unknown = rest.find((a) => a.startsWith("--") && a !== "--check");
      if (unknown) {
        console.error(`Unknown flag: ${unknown}`);
        console.error("Usage: port-pool ensure <directory> [--check]");
        process.exit(1);
      }
      const checkOnly = rest.includes("--check");
      const positional = rest.filter((a) => !a.startsWith("--"));
      if (positional.length === 0) {
        console.error("Usage: port-pool ensure <directory> [--check]");
        process.exit(1);
      }
      if (positional.length > 1) {
        console.error(`Unexpected extra arguments: ${positional.slice(1).join(" ")}`);
        console.error("Usage: port-pool ensure <directory> [--check]");
        process.exit(1);
      }
      ensure(positional[0], { checkOnly });
      break;
    }
    case "list":
      list();
      break;
    case "prune": {
      const unknown = rest.find((a) => a.startsWith("--") && a !== "--dry-run");
      if (unknown) {
        console.error(`Unknown flag: ${unknown}`);
        console.error("Usage: port-pool prune [--dry-run]");
        process.exit(1);
      }
      const positional = rest.filter((a) => !a.startsWith("--"));
      if (positional.length > 0) {
        console.error(`Unexpected arguments: ${positional.join(" ")}`);
        console.error("Usage: port-pool prune [--dry-run]");
        process.exit(1);
      }
      prune({ dryRun: rest.includes("--dry-run") });
      break;
    }
    case "setup-guide":
      setupGuide();
      break;
    case "version":
    case "--version":
    case "-v":
      version();
      break;
    case "update":
      await update();
      break;
    case "help":
    case "--help":
    case "-h":
      printUsage();
      break;
    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }

  await maybeCheckForUpdate();
}

main();
