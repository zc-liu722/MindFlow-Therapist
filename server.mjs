import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT ?? 3000);
const ENCRYPTION_SECRET =
  process.env.APP_ENCRYPTION_KEY ?? "dev-only-encryption-key-change-me";
const ADMIN_INVITE_CODE = process.env.ADMIN_INVITE_CODE ?? "owner-demo-only";
const SESSION_COOKIE = "mt_session";
const DB_PATH = path.join(__dirname, "data", "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const defaultDb = {
  users: [],
  authSessions: [],
  therapySessions: [],
  therapyJournals: [],
  supervisionRuns: [],
  supervisionJournals: [],
  analyticsEvents: []
};

let writeQueue = Promise.resolve();

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath, contentType) {
  return fs.readFile(filePath).then(
    (buffer) => {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(buffer);
    },
    () => {
      res.writeHead(404);
      res.end("Not Found");
    }
  );
}

async function ensureDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(defaultDb, null, 2), "utf8");
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeDb(updater) {
  writeQueue = writeQueue.then(async () => {
    const db = await readDb();
    const next = updater(db) ?? db;
    await fs.writeFile(DB_PATH, JSON.stringify(next, null, 2), "utf8");
  });
  await writeQueue;
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function hashText(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto
    .pbkdf2Sync(password, salt, 120000, 32, "sha256")
    .toString("hex");
  return { passwordHash, passwordSalt: salt };
}

function createUserKey(userId) {
  return crypto
    .createHash("sha256")
    .update(`${ENCRYPTION_SECRET}:${userId}`)
    .digest();
}

function encryptForUser(userId, value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", createUserKey(userId), iv);
  const content = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    content: content.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

function decryptForUser(userId, blob) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    createUserKey(userId),
    Buffer.from(blob.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(blob.content, "base64")),
    decipher.final()
  ]);
  return plain.toString("utf8");
}

function parseCookies(req) {
  const header = req.headers.cookie ?? "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function setCookie(res, name, value, expires) {
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}`;
  res.setHeader("Set-Cookie", cookie);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function redactSensitiveText(input) {
  return input
    .replace(/\b1\d{10}\b/g, "[已脱敏]")
    .replace(/\b\d{15,18}[\dXx]?\b/g, "[已脱敏]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[已脱敏]")
    .replace(/我叫[\u4e00-\u9fa5A-Za-z]{2,8}/g, "我叫[已脱敏]")
    .replace(/住在[\u4e00-\u9fa5A-Za-z0-9]{2,20}/g, "住在[已脱敏]");
}

function detectRiskLevel(text) {
  const value = text.toLowerCase();
  if (value.includes("自杀") || value.includes("不想活") || value.includes("伤害自己")) {
    return "high";
  }
  if (value.includes("焦虑") || value.includes("崩溃") || value.includes("失眠")) {
    return "medium";
  }
  return "low";
}

function summarizeThemes(messages) {
  const joined = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ");
  const pairs = [
    ["关系压力", /(关系|伴侣|家庭|父母|婚姻|朋友)/],
    ["自我要求", /(内疚|自责|不够好|失败|完美)/],
    ["焦虑与压迫", /(焦虑|压力|担心|害怕|紧张)/],
    ["情绪耗竭", /(累|疲惫|撑不住|麻木|失眠)/],
    ["边界与表达", /(拒绝|表达|冲突|边界|说不)/]
  ];
  const themes = pairs.filter(([, regex]) => regex.test(joined)).map(([label]) => label);
  return themes.length ? themes : ["情绪梳理", "压力识别"];
}

function buildAssistantReply(messages) {
  const lastUser = [...messages].reverse().find((item) => item.role === "user")?.content ?? "";
  const themes = summarizeThemes(messages);
  const riskLevel = detectRiskLevel(lastUser);
  const content = [
    riskLevel === "high"
      ? "你提到的痛苦程度已经很高了，我会先把安全放在最前面。"
      : "我听见你这段时间真的扛了很多，我们先慢慢把它摊开。",
    `我此刻捕捉到的主题是：${themes.join("、")}。`,
    "如果你愿意，我们先停在一个最具体的瞬间，看看那里发生了什么想法、情绪和身体反应。",
    riskLevel === "high"
      ? "如果你有现实中的自伤风险，请优先联系可信任的人和当地紧急援助资源。"
      : "你不必一次说完整件事，我们只处理眼前最需要被理解的那一段。"
  ].join("\n\n");
  return {
    message: {
      id: createId("msg"),
      role: "assistant",
      content,
      createdAt: new Date().toISOString()
    },
    riskLevel,
    themes
  };
}

function buildTherapyJournal(messages, title) {
  const userMessages = messages.filter((message) => message.role === "user");
  const themes = summarizeThemes(messages);
  const riskLevel = detectRiskLevel(userMessages.map((item) => item.content).join(" "));
  const quote = redactSensitiveText(userMessages.at(-1)?.content ?? "本次表达较为克制。");
  return {
    content: `# Therapy Journal

## 来访者画像
- 称呼：来访者
- 背景概要：近期围绕 ${themes.join("、")} 展开，原始身份信息已脱敏。
- 核心议题：${themes.join("、")}
- 咨询目标：希望获得更稳定的情绪理解、边界感与行动方向。

## 关系模式与人格特点
- 在压力下容易先压住自己的需要，再去照顾他人的期待。
- 对冲突和评价较为敏感，常常会提前预设最坏结果。
- 有较强的责任感，但也因此容易进入自责和过度承担。

## 治疗进程
### ${new Date().toISOString().slice(0, 10)} | 本次会谈 | 整合取向
- **本次议题**：${title}
- **关键时刻**：${quote}
- **咨询师观察**：适合继续围绕高压场景做情绪命名、自动化想法辨识与边界工作。
- **下次跟进**：追踪一个最刺痛的片段，梳理触发点、核心信念与新的应对选择。

## 安全备忘
- 风险等级：${riskLevel}
- 已确认的边界约定：网页端按用户隔离，仅本人可见原文。`,
    redactedSummary: `聚焦 ${themes.join("、")}，风险等级 ${riskLevel}。`
  };
}

function buildSupervision(messages, sessionTitle) {
  const themes = summarizeThemes(messages);
  const example = redactSensitiveText(
    messages.filter((message) => message.role === "user").at(-1)?.content ?? "来访者表达了压力。"
  );
  return {
    transcript: [
      {
        id: createId("sup"),
        role: "supervisor",
        content: `这次会谈围绕 ${themes.join("、")} 展开，咨询师的陪伴感足够，但可以更早帮助来访者把压力具象化。`,
        createdAt: new Date().toISOString()
      },
      {
        id: createId("sup"),
        role: "assistant",
        content: "我注意到自己更偏向安抚，还没有足够停留在那个触发点上。",
        createdAt: new Date().toISOString()
      },
      {
        id: createId("sup"),
        role: "supervisor",
        content: `值得回看的瞬间是：${example}。下次可以问“那一刻你最怕发生什么”，更容易接近核心信念。`,
        createdAt: new Date().toISOString()
      }
    ],
    journalEntry: `# Supervision Journal

## 督导关系概要
- 督导取向：整合取向
- 督导重点：案例概念化、情绪命名、触发链条识别

## 督导进程
### ${new Date().toISOString().slice(0, 10)} | 本次督导 | 针对 ${sessionTitle}
- **督导焦点**：${themes.join("、")}
- **关键洞见**：来访者最需要的不只是被安抚，更需要有人帮助她把压力时刻拆开并命名。
- **技术建议**：继续围绕“那一刻发生了什么”“你最怕什么”“身体哪里最有感觉”推进。`,
    redactedSummary: `已完成督导，重点聚焦 ${themes.join("、")}。`,
    journalEntryPreview: `督导建议继续围绕 ${themes.join("、")} 做细化探索。`
  };
}

async function getCurrentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const db = await readDb();
  const authSession = db.authSessions.find(
    (item) =>
      item.tokenHash === hashText(token) &&
      new Date(item.expiresAt).getTime() > Date.now()
  );
  if (!authSession) {
    return null;
  }
  return db.users.find((user) => user.id === authSession.userId) ?? null;
}

async function createAuthSession(res, userId) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await writeDb((db) => {
    db.authSessions = db.authSessions.filter(
      (item) => new Date(item.expiresAt).getTime() > Date.now()
    );
    db.authSessions.push({
      id: createId("auth"),
      userId,
      tokenHash: hashText(rawToken),
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    });
  });
  setCookie(res, SESSION_COOKIE, rawToken, expiresAt);
}

async function clearAuthSession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    await writeDb((db) => {
      db.authSessions = db.authSessions.filter((item) => item.tokenHash !== hashText(token));
    });
  }
  setCookie(res, SESSION_COOKIE, "", new Date(0));
}

async function logEvent(user, type, metadata = {}, sessionId) {
  await writeDb((db) => {
    db.analyticsEvents.push({
      id: createId("evt"),
      userHash: user.analyticsId,
      type,
      sessionId,
      createdAt: new Date().toISOString(),
      metadata
    });
  });
}

function parseTranscript(session) {
  return JSON.parse(decryptForUser(session.userId, session.transcript));
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/me" && req.method === "GET") {
    const user = await getCurrentUser(req);
    return json(res, 200, {
      user: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role
          }
        : null
    });
  }

  if (pathname === "/api/auth/register" && req.method === "POST") {
    const body = await parseBody(req);
    if (!body.username || !body.displayName || !body.password || !body.role) {
      return json(res, 400, { error: "请完整填写注册信息" });
    }
    const db = await readDb();
    const username = String(body.username).trim().toLowerCase();
    if (db.users.some((user) => user.username === username)) {
      return json(res, 400, { error: "该用户名已经被注册" });
    }
    if (body.role === "admin" && body.adminInviteCode !== ADMIN_INVITE_CODE) {
      return json(res, 400, { error: "管理员邀请码不正确" });
    }
    const { passwordHash, passwordSalt } = createPasswordHash(String(body.password));
    const user = {
      id: createId("user"),
      username,
      displayName: String(body.displayName).trim(),
      role: body.role,
      passwordHash,
      passwordSalt,
      analyticsId: hashText(`${username}:${Date.now()}`),
      createdAt: new Date().toISOString()
    };
    await writeDb((draft) => {
      draft.users.push(user);
    });
    await createAuthSession(res, user.id);
    await logEvent(user, "register", { role: user.role });
    return json(res, 200, { user: { ...user, passwordHash: undefined, passwordSalt: undefined } });
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await parseBody(req);
    const db = await readDb();
    const username = String(body.username ?? "").trim().toLowerCase();
    const user = db.users.find((item) => item.username === username);
    if (!user) {
      return json(res, 400, { error: "用户名或密码不正确" });
    }
    const check = createPasswordHash(String(body.password ?? ""), user.passwordSalt).passwordHash;
    if (check !== user.passwordHash) {
      return json(res, 400, { error: "用户名或密码不正确" });
    }
    await createAuthSession(res, user.id);
    await logEvent(user, "login", { role: user.role });
    return json(res, 200, { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    await clearAuthSession(req, res);
    return json(res, 200, { ok: true });
  }

  const user = await getCurrentUser(req);
  if (!user) {
    return json(res, 401, { error: "未授权" });
  }

  if (pathname === "/api/sessions" && req.method === "GET") {
    const db = await readDb();
    const sessions = db.therapySessions
      .filter((item) => item.userId === user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return json(res, 200, { sessions });
  }

  if (pathname === "/api/sessions" && req.method === "POST") {
    const body = await parseBody(req);
    if (user.role !== "user") {
      return json(res, 403, { error: "禁止访问" });
    }
    const title = String(body.title ?? "").trim();
    if (!title) {
      return json(res, 400, { error: "请输入 session 标题" });
    }
    const session = {
      id: createId("session"),
      userId: user.id,
      title,
      mode: String(body.mode ?? "整合取向"),
      status: "active",
      autoSupervision: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      lastMessagePreview: "等待开始对话",
      redactedSummary: "尚未形成摘要",
      messageCount: 0,
      riskLevel: "low",
      transcript: encryptForUser(user.id, JSON.stringify([]))
    };
    await writeDb((db) => {
      db.therapySessions.push(session);
    });
    await logEvent(user, "session_created", { autoSupervision: session.autoSupervision }, session.id);
    return json(res, 200, { session });
  }

  const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch && req.method === "GET") {
    const sessionId = sessionMatch[1];
    const db = await readDb();
    const session = db.therapySessions.find((item) => item.id === sessionId && item.userId === user.id);
    if (!session) {
      return json(res, 404, { error: "NOT_FOUND" });
    }
    return json(res, 200, { session: { ...session, messages: parseTranscript(session) } });
  }

  const messageMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (messageMatch && req.method === "POST") {
    const sessionId = messageMatch[1];
    const body = await parseBody(req);
    const content = String(body.content ?? "").trim();
    if (!content) {
      return json(res, 400, { error: "请输入内容" });
    }
    const db = await readDb();
    const session = db.therapySessions.find((item) => item.id === sessionId && item.userId === user.id);
    if (!session) {
      return json(res, 404, { error: "NOT_FOUND" });
    }
    if (session.status !== "active") {
      return json(res, 400, { error: "SESSION_CLOSED" });
    }
    const transcript = parseTranscript(session);
    const userMessage = {
      id: createId("msg"),
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    const assistant = buildAssistantReply([...transcript, userMessage]);
    const nextMessages = [...transcript, userMessage, assistant.message];
    await writeDb((draft) => {
      const target = draft.therapySessions.find((item) => item.id === sessionId);
      target.transcript = encryptForUser(user.id, JSON.stringify(nextMessages));
      target.updatedAt = new Date().toISOString();
      target.lastMessagePreview = assistant.message.content.slice(0, 80);
      target.redactedSummary = `近期聚焦 ${assistant.themes.join("、")}。`;
      target.messageCount = nextMessages.length;
      target.riskLevel = assistant.riskLevel;
    });
    await logEvent(user, "message_sent", { riskLevel: assistant.riskLevel }, sessionId);
    return json(res, 200, { userMessage, assistantMessage: assistant.message });
  }

  const completeMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/complete$/);
  if (completeMatch && req.method === "POST") {
    const sessionId = completeMatch[1];
    const db = await readDb();
    const session = db.therapySessions.find((item) => item.id === sessionId && item.userId === user.id);
    if (!session) {
      return json(res, 404, { error: "NOT_FOUND" });
    }
    const messages = parseTranscript(session);
    const therapyDraft = buildTherapyJournal(messages, session.title);
    const therapyExisting = db.therapyJournals.find((item) => item.userId === user.id);
    const therapyContent = therapyExisting
      ? `${therapyDraft.content}\n\n---\n\n${decryptForUser(user.id, therapyExisting.content)}`
      : therapyDraft.content;

    let supervisionRun = null;
    let supervisionJournal = null;
    if (session.autoSupervision) {
      const supervision = buildSupervision(messages, session.title);
      supervisionRun = {
        id: createId("supervision"),
        userId: user.id,
        sessionId,
        status: "completed",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        transcript: encryptForUser(user.id, JSON.stringify(supervision.transcript)),
        redactedSummary: supervision.redactedSummary,
        journalEntryPreview: supervision.journalEntryPreview
      };
      const currentSupervision = db.supervisionJournals.find((item) => item.userId === user.id);
      const supervisionContent = currentSupervision
        ? `${supervision.journalEntry}\n\n---\n\n${decryptForUser(user.id, currentSupervision.content)}`
        : supervision.journalEntry;
      supervisionJournal = {
        id: currentSupervision?.id ?? createId("supervision_journal"),
        userId: user.id,
        updatedAt: new Date().toISOString(),
        content: encryptForUser(user.id, supervisionContent),
        redactedSummary: supervision.redactedSummary
      };
    }

    await writeDb((draft) => {
      const target = draft.therapySessions.find((item) => item.id === sessionId);
      target.status = "completed";
      target.completedAt = new Date().toISOString();
      target.updatedAt = new Date().toISOString();
      target.redactedSummary = therapyDraft.redactedSummary;
      if (supervisionRun) {
        target.supervisionId = supervisionRun.id;
      }

      const therapyJournal = draft.therapyJournals.find((item) => item.userId === user.id);
      if (therapyJournal) {
        therapyJournal.updatedAt = new Date().toISOString();
        therapyJournal.content = encryptForUser(user.id, therapyContent);
        therapyJournal.redactedSummary = therapyDraft.redactedSummary;
      } else {
        draft.therapyJournals.push({
          id: createId("therapy_journal"),
          userId: user.id,
          updatedAt: new Date().toISOString(),
          content: encryptForUser(user.id, therapyContent),
          redactedSummary: therapyDraft.redactedSummary
        });
      }

      if (supervisionRun) {
        draft.supervisionRuns.push(supervisionRun);
      }

      if (supervisionJournal) {
        const existing = draft.supervisionJournals.find((item) => item.userId === user.id);
        if (existing) {
          existing.updatedAt = supervisionJournal.updatedAt;
          existing.content = supervisionJournal.content;
          existing.redactedSummary = supervisionJournal.redactedSummary;
        } else {
          draft.supervisionJournals.push(supervisionJournal);
        }
      }
    });

    await logEvent(user, "session_completed", { autoSupervision: session.autoSupervision }, sessionId);
    if (session.autoSupervision) {
      await logEvent(user, "supervision_completed", {}, sessionId);
    }

    return json(res, 200, { sessionId, supervisionCreated: Boolean(supervisionRun) });
  }

  if (pathname === "/api/journal/therapy" && req.method === "GET") {
    const db = await readDb();
    const journal = db.therapyJournals.find((item) => item.userId === user.id);
    return json(res, 200, {
      content: journal
        ? decryptForUser(user.id, journal.content)
        : "还没有咨询师手帐。完成一次 session 后，这里会自动生成结构化记录。"
    });
  }

  if (pathname === "/api/journal/supervision" && req.method === "GET") {
    const db = await readDb();
    const journal = db.supervisionJournals.find((item) => item.userId === user.id);
    const runs = db.supervisionRuns
      .filter((item) => item.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({
        id: item.id,
        sessionId: item.sessionId,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
        redactedSummary: item.redactedSummary,
        transcript: JSON.parse(decryptForUser(user.id, item.transcript))
      }));
    return json(res, 200, {
      content: journal
        ? decryptForUser(user.id, journal.content)
        : "还没有督导手帐。完成一次会谈后，这里会累积督导洞见。",
      runs
    });
  }

  if (pathname === "/api/admin/overview" && req.method === "GET") {
    if (user.role !== "admin") {
      return json(res, 403, { error: "禁止访问" });
    }
    const db = await readDb();
    const sessions = db.therapySessions;
    const completed = sessions.filter((item) => item.status === "completed");
    const riskDistribution = {
      low: sessions.filter((item) => item.riskLevel === "low").length,
      medium: sessions.filter((item) => item.riskLevel === "medium").length,
      high: sessions.filter((item) => item.riskLevel === "high").length
    };
    const sessionsByDayMap = new Map();
    sessions.forEach((session) => {
      const day = session.createdAt.slice(0, 10);
      sessionsByDayMap.set(day, (sessionsByDayMap.get(day) ?? 0) + 1);
    });
    const eventsByTypeMap = new Map();
    db.analyticsEvents.forEach((event) => {
      eventsByTypeMap.set(event.type, (eventsByTypeMap.get(event.type) ?? 0) + 1);
    });
    return json(res, 200, {
      totalUsers: db.users.filter((item) => item.role === "user").length,
      totalSessions: sessions.length,
      completedSessions: completed.length,
      supervisionRate:
        completed.length === 0
          ? 0
          : Number(
              (
                (completed.filter((item) => item.supervisionId).length / completed.length) *
                100
              ).toFixed(1)
            ),
      averageTurns:
        sessions.length === 0
          ? 0
          : Number(
              (
                sessions.reduce((sum, item) => sum + item.messageCount, 0) / sessions.length
              ).toFixed(1)
            ),
      riskDistribution,
      sessionsByDay: [...sessionsByDayMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count })),
      eventsByType: [...eventsByTypeMap.entries()].map(([type, count]) => ({ type, count }))
    });
  }

  return json(res, 404, { error: "Not Found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith("/api/")) {
      return await handleApi(req, res, pathname);
    }

    if (pathname === "/app" || pathname === "/admin" || pathname === "/") {
      return sendFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
    }

    if (pathname === "/app.js") {
      return sendFile(res, path.join(PUBLIC_DIR, "app.js"), "application/javascript; charset=utf-8");
    }

    if (pathname === "/styles.css") {
      return sendFile(res, path.join(PUBLIC_DIR, "styles.css"), "text/css; charset=utf-8");
    }

    res.writeHead(404);
    res.end("Not Found");
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "服务器内部错误" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`MindFlow Therapist running at http://127.0.0.1:${PORT}`);
});
