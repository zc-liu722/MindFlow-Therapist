import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createId, createPasswordHash, createRandomToken, hashText } from "@/lib/crypto";
import { readDb, writeDb } from "@/lib/db";
import { assertRequiredConsents, CONSENT_VERSION, validateConsentInput } from "@/lib/privacy";
import type { AuthSessionRecord, Role, UserRecord } from "@/lib/types";

const SESSION_COOKIE = "mt_session";
const SESSION_DAYS = 14;

function getExpiryDate() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

function shouldUseSecureCookie() {
  if (process.env.COOKIE_SECURE === "false") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function createPasswordMaterial(password?: string) {
  const value = password?.trim();
  if (!value) {
    throw new Error("请输入密码");
  }

  if (value.length < 8) {
    throw new Error("密码至少需要 8 位");
  }

  return createPasswordHash(value);
}

function getAdminInviteCode() {
  const value = process.env.ADMIN_INVITE_CODE?.trim();

  if (!value) {
    throw new Error("ADMIN_INVITE_CODE_MISSING");
  }

  if (value === "owner-demo-only" || value === "change-me") {
    throw new Error("ADMIN_INVITE_CODE_INSECURE");
  }

  return value;
}

export async function registerUser(input: {
  username: string;
  displayName?: string;
  password: string;
  role?: Role;
  adminInviteCode?: string;
  privacyConsent?: boolean;
  aiProcessingConsent?: boolean;
}) {
  const db = await readDb();
  const username = normalizeUsername(input.username);
  const role = input.role ?? "user";
  const displayName = input.displayName?.trim() || username;
  validateConsentInput(input);

  if (!username) {
    throw new Error("请输入用户名");
  }

  if (db.users.some((user) => user.username === username)) {
    throw new Error("该用户名已经被注册");
  }

  if (role === "admin") {
    const expectedCode = getAdminInviteCode();
    if (input.adminInviteCode !== expectedCode) {
      throw new Error("管理员邀请码不正确");
    }
  }

  const { passwordHash, passwordSalt } = createPasswordMaterial(input.password);
  const consentAt = new Date().toISOString();
  const user: UserRecord = {
    id: createId("user"),
    username,
    displayName,
    role,
    passwordHash,
    passwordSalt,
    analyticsId: hashText(`${username}:${Date.now()}`),
    consentVersion: CONSENT_VERSION,
    privacyConsentAt: consentAt,
    aiProcessingConsentAt: consentAt,
    createdAt: new Date().toISOString()
  };

  await writeDb((draft) => {
    draft.users.push(user);
  });

  return user;
}

export async function loginUser(
  usernameInput: string,
  passwordInput: string,
  options?: {
    requiredRole?: Role;
    privacyConsent?: boolean;
    aiProcessingConsent?: boolean;
  }
) {
  const db = await readDb();
  const username = normalizeUsername(usernameInput);
  const requiredRole = options?.requiredRole;
  const password = passwordInput.trim();

  if (!username) {
    throw new Error("请输入用户名");
  }

  if (!password) {
    throw new Error("请输入密码");
  }

  const existingUser = db.users.find((item) => item.username === username);
  if (!existingUser) {
    throw new Error("INVALID_CREDENTIALS");
  }

  if (requiredRole && existingUser.role !== requiredRole) {
    throw new Error("FORBIDDEN_ROLE");
  }

  const check = createPasswordHash(password, existingUser.passwordSalt).passwordHash;
  if (check !== existingUser.passwordHash) {
    throw new Error("INVALID_CREDENTIALS");
  }

  validateConsentInput({
    privacyConsent: options?.privacyConsent,
    aiProcessingConsent: options?.aiProcessingConsent
  });

  const consentAt = new Date().toISOString();
  await writeDb((draft) => {
    const mutableUser = draft.users.find((item) => item.id === existingUser.id);
    if (!mutableUser) {
      return;
    }

    mutableUser.consentVersion = CONSENT_VERSION;
    mutableUser.privacyConsentAt = consentAt;
    mutableUser.aiProcessingConsentAt = consentAt;
  });

  return {
    user: {
      ...existingUser,
      consentVersion: CONSENT_VERSION,
      privacyConsentAt: consentAt,
      aiProcessingConsentAt: consentAt
    },
    created: false
  };
}

export async function createAuthSession(userId: string) {
  const rawToken = createRandomToken();
  const session: AuthSessionRecord = {
    id: createId("auth"),
    userId,
    tokenHash: hashText(rawToken),
    createdAt: new Date().toISOString(),
    expiresAt: getExpiryDate().toISOString()
  };

  await writeDb((draft) => {
    draft.authSessions = draft.authSessions.filter(
      (item) => new Date(item.expiresAt).getTime() > Date.now()
    );
    draft.authSessions.push(session);
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    expires: getExpiryDate(),
    path: "/"
  });
}

export async function clearAuthSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await writeDb((draft) => {
      draft.authSessions = draft.authSessions.filter(
        (item) => item.tokenHash !== hashText(token)
      );
    });
  }

  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    expires: new Date(0),
    path: "/"
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
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

  const user = db.users.find((item) => item.id === authSession.userId) ?? null;
  if (!user) {
    return null;
  }

  try {
    assertRequiredConsents(user);
  } catch {
    return null;
  }

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  assertRequiredConsents(user);
  return user;
}

export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== role) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireUserPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }
  const resolvedUser = user!;
  if (resolvedUser.role !== "user") {
    redirect("/admin");
  }
  return resolvedUser;
}

export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }
  const resolvedUser = user!;
  if (resolvedUser.role !== "admin") {
    redirect("/app");
  }
  return resolvedUser;
}
