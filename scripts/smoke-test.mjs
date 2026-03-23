import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const PORT = 3101;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(ROOT, "data", "db.json");
const DB_BACKUP_PATH = path.join(ROOT, "data", `db.smoke-backup-${Date.now()}.json`);
const USER_PASSWORD = "SmokeUserPass123!";
const ADMIN_PASSWORD = "SmokeAdminPass123!";

function parseEnvFile(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

async function readLocalEnv() {
  const envPath = path.join(ROOT, ".env.local");
  const content = await readFile(envPath, "utf8");
  return parseEnvFile(content);
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/me`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Smoke server did not become ready in time");
}

function createCookieJar() {
  let cookieHeader = "";

  return {
    apply(headers) {
      if (cookieHeader) {
        headers.cookie = cookieHeader;
      }
    },
    update(response) {
      const setCookies =
        typeof response.headers.getSetCookie === "function"
          ? response.headers.getSetCookie()
          : response.headers.get("set-cookie")
            ? [response.headers.get("set-cookie")]
            : [];

      if (setCookies.length === 0) {
        return;
      }

      cookieHeader = setCookies
        .map((value) => value.split(";", 1)[0])
        .filter(Boolean)
        .join("; ");
    }
  };
}

async function requestJson(pathname, init = {}, jar) {
  const headers = {
    "content-type": "application/json",
    ...(init.headers ?? {})
  };

  jar?.apply(headers);

  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers
  });

  jar?.update(response);

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { response, payload };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const localEnv = await readLocalEnv();
  const adminInviteCode = localEnv.ADMIN_INVITE_CODE?.trim();

  assert(adminInviteCode, "ADMIN_INVITE_CODE is required in .env.local for smoke tests");

  if (existsSync(DB_PATH)) {
    await copyFile(DB_PATH, DB_BACKUP_PATH);
  }

  await writeFile(
    DB_PATH,
    JSON.stringify(
      {
        users: [],
        authSessions: [],
        therapySessions: [],
        therapyJournals: [],
        supervisionRuns: [],
        supervisionJournals: [],
        analyticsEvents: []
      },
      null,
      2
    ),
    "utf8"
  );

  const server = spawn(
    process.execPath,
    ["scripts/run-with-node-compat.mjs", "start", "-H", "127.0.0.1", "-p", String(PORT)],
    {
      cwd: ROOT,
      stdio: "pipe",
      env: process.env
    }
  );

  let serverLog = "";
  server.stdout.on("data", (chunk) => {
    serverLog += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverLog += chunk.toString();
  });

  try {
    await waitForServer();

    const userJar = createCookieJar();
    const userName = `smoke-user-${randomUUID().slice(0, 8)}`;

    const registerResult = await requestJson(
      "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify({
          username: userName,
          displayName: userName,
          password: USER_PASSWORD,
          role: "user",
          privacyConsent: true,
          aiProcessingConsent: true
        })
      },
      userJar
    );
    assert(registerResult.response.ok, `User register failed: ${JSON.stringify(registerResult.payload)}`);

    const sessionResult = await requestJson(
      "/api/sessions",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Smoke Session",
          mode: "整合式心理治疗（Integrative）",
          autoSupervision: true
        })
      },
      userJar
    );
    assert(sessionResult.response.ok, `Session creation failed: ${JSON.stringify(sessionResult.payload)}`);
    const sessionId = sessionResult.payload?.session?.id;
    assert(sessionId, "Session id missing from create response");

    const messageResult = await requestJson(
      `/api/sessions/${sessionId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content: "我最近有些焦虑，想整理一下压力和关系里的卡点。"
        })
      },
      userJar
    );
    assert(messageResult.response.ok, `Message send failed: ${JSON.stringify(messageResult.payload)}`);

    const completeOnce = await requestJson(
      `/api/sessions/${sessionId}/complete`,
      { method: "POST" },
      userJar
    );
    assert(completeOnce.response.ok, `First completion failed: ${JSON.stringify(completeOnce.payload)}`);
    assert(completeOnce.payload?.alreadyCompleted === false, "First completion should not be marked already completed");

    const completeTwice = await requestJson(
      `/api/sessions/${sessionId}/complete`,
      { method: "POST" },
      userJar
    );
    assert(completeTwice.response.ok, `Second completion failed: ${JSON.stringify(completeTwice.payload)}`);
    assert(completeTwice.payload?.alreadyCompleted === true, "Second completion should be idempotent");

    const supervisionJournal = await requestJson("/api/journal/supervision", {}, userJar);
    assert(supervisionJournal.response.ok, "Supervision journal fetch failed");
    assert(
      Array.isArray(supervisionJournal.payload?.runs) &&
        supervisionJournal.payload.runs.length === 1,
      "Repeated completion should not create duplicate supervision runs"
    );

    const adminJar = createCookieJar();
    const adminName = `smoke-admin-${randomUUID().slice(0, 8)}`;
    const adminRegister = await requestJson(
      "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify({
          username: adminName,
          displayName: adminName,
          password: ADMIN_PASSWORD,
          role: "admin",
          adminInviteCode,
          privacyConsent: true,
          aiProcessingConsent: true
        })
      },
      adminJar
    );
    assert(adminRegister.response.ok, `Admin register failed: ${JSON.stringify(adminRegister.payload)}`);

    const adminOverview = await requestJson("/api/admin/overview", {}, adminJar);
    assert(adminOverview.response.ok, `Admin overview failed: ${JSON.stringify(adminOverview.payload)}`);

    console.log("Smoke test passed");
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));

    if (existsSync(DB_BACKUP_PATH)) {
      await copyFile(DB_BACKUP_PATH, DB_PATH);
      await rm(DB_BACKUP_PATH, { force: true });
    } else {
      await rm(DB_PATH, { force: true });
    }

    if (serverLog.trim()) {
      await writeFile(path.join(ROOT, ".smoke-test.log"), serverLog, "utf8");
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
