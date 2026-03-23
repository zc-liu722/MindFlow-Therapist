import { promises as fs } from "node:fs";
import path from "node:path";

import type { DatabaseShape } from "@/lib/types";

function resolveDbPath() {
  const dataDir = process.env.DATA_DIR?.trim();
  if (dataDir) {
    return path.join(dataDir, "db.json");
  }

  return path.join(process.cwd(), "data", "db.json");
}

const dbPath = resolveDbPath();

let writeQueue = Promise.resolve();

const emptyDb: DatabaseShape = {
  users: [],
  authSessions: [],
  therapySessions: [],
  therapyJournals: [],
  supervisionRuns: [],
  supervisionJournals: [],
  analyticsEvents: []
};

async function ensureDbFile() {
  try {
    await fs.access(dbPath);
  } catch {
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.writeFile(dbPath, JSON.stringify(emptyDb, null, 2), "utf8");
  }
}

export async function readDb(): Promise<DatabaseShape> {
  await ensureDbFile();
  const raw = await fs.readFile(dbPath, "utf8");
  return JSON.parse(raw) as DatabaseShape;
}

export async function writeDb(updater: (db: DatabaseShape) => DatabaseShape | void) {
  writeQueue = writeQueue.then(async () => {
    const current = await readDb();
    const next = updater(current) ?? current;
    await fs.writeFile(dbPath, JSON.stringify(next, null, 2), "utf8");
  });

  await writeQueue;
}
