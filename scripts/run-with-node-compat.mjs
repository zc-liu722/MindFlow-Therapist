import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function withShimNodeOptions() {
  const shimPath = path.resolve(process.cwd(), "scripts/node-compat-shim.cjs");
  const existing = process.env.NODE_OPTIONS?.trim();
  return existing
    ? `--require=${shimPath} ${existing}`
    : `--require=${shimPath}`;
}

function resolveEntrypoint(command) {
  if (command === "dev" || command === "build" || command === "start") {
    return require.resolve("next/dist/bin/next");
  }

  return null;
}

function resetNextArtifacts(command) {
  if (command !== "dev" && command !== "build") {
    return;
  }

  const nextDir = path.resolve(process.cwd(), ".next");
  if (!existsSync(nextDir)) {
    return;
  }

  rmSync(nextDir, { force: true, recursive: true });
}

const command = process.argv[2];
resetNextArtifacts(command);
const entrypoint = resolveEntrypoint(command);

if (!entrypoint) {
  console.error(`Unsupported command: ${command ?? "(missing)"}`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [entrypoint, command, ...process.argv.slice(3)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: withShimNodeOptions()
    }
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
