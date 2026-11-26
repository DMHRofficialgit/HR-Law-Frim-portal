import type { RefreshSession, User } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { createRawRefreshToken, hashToken, publicUser, signAccessToken } from "../lib/tokens";

export type SessionMeta = {
  absoluteExpiresAt: string;
  idleMinutes: number;
  accessTtlMinutes: number;
};

export type AuthBundle = {
  token: string;
  refreshToken: string;
  user: ReturnType<typeof publicUser>;
  session: SessionMeta;
};

function httpError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

function sessionMeta(session: RefreshSession): SessionMeta {
  return {
    absoluteExpiresAt: session.expiresAt.toISOString(),
    idleMinutes: env.SESSION_IDLE_MINUTES,
    accessTtlMinutes: env.JWT_ACCESS_TTL_MINUTES,
  };
}

function absoluteExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000);
}

function idleDeadline(lastActiveAt: Date): Date {
  return new Date(lastActiveAt.getTime() + env.SESSION_IDLE_MINUTES * 60 * 1000);
}

export async function createAuthBundle(user: User): Promise<AuthBundle> {
  const now = new Date();
  const raw = createRawRefreshToken();
  const session = await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      lastActiveAt: now,
      expiresAt: absoluteExpiryFrom(now),
    },
  });

  return {
    token: signAccessToken(user, session.id),
    refreshToken: raw,
    user: publicUser(user),
    session: sessionMeta(session),
  };
}

export async function revokeSessionById(sessionId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Invalidate all prior JWTs + refresh rows, then open a fresh session. */
export async function rotateAuthAfterCredentialChange(userId: string): Promise<AuthBundle> {
  const updated = await prisma.$transaction(async (tx) => {
    await tx.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  });
  return createAuthBundle(updated);
}

export async function touchSessionActivity(sessionId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { lastActiveAt: new Date() },
  });
}

export async function assertSessionUsable(sessionId: string, userId: string): Promise<RefreshSession> {
  const session = await prisma.refreshSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session || session.revokedAt) {
    throw httpError("Session ended — please sign in again", 401, "SESSION_REVOKED");
  }
  const now = new Date();
  if (session.expiresAt <= now) {
    await revokeSessionById(session.id);
    throw httpError("Session expired — please sign in again", 401, "SESSION_ABSOLUTE");
  }
  if (idleDeadline(session.lastActiveAt) <= now) {
    await revokeSessionById(session.id);
    throw httpError("Signed out due to inactivity", 401, "SESSION_IDLE");
  }
  return session;
}

export async function refreshAuthBundle(rawRefreshToken: string): Promise<AuthBundle> {
  const tokenHash = hashToken(rawRefreshToken);
  const session = await prisma.refreshSession.findFirst({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.revokedAt) {
    throw httpError("Session ended — please sign in again", 401, "SESSION_REVOKED");
  }

  const now = new Date();
  if (session.expiresAt <= now) {
    await revokeSessionById(session.id);
    throw httpError("Session expired — please sign in again", 401, "SESSION_ABSOLUTE");
  }
  if (idleDeadline(session.lastActiveAt) <= now) {
    await revokeSessionById(session.id);
    throw httpError("Signed out due to inactivity", 401, "SESSION_IDLE");
  }
  if (session.user.status !== "active") {
    await revokeSessionById(session.id);
    throw httpError("Authentication required", 401, "UNAUTHORIZED");
  }
  if (session.user.role === "client" && !session.user.organisationId) {
    throw httpError("Client account is not linked to an organisation", 403, "FORBIDDEN");
  }

  const updated = await prisma.refreshSession.update({
    where: { id: session.id },
    data: { lastActiveAt: now },
  });

  return {
    token: signAccessToken(session.user, session.id),
    refreshToken: rawRefreshToken,
    user: publicUser(session.user),
    session: sessionMeta(updated),
  };
}

export function isHttpError(
  err: unknown
): err is Error & { status: number; code: string } {
  return (
    err instanceof Error &&
    typeof (err as { status?: unknown }).status === "number" &&
    typeof (err as { code?: unknown }).code === "string"
  );
}
