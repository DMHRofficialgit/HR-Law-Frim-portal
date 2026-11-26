import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { createRawInviteToken, hashToken } from "../lib/tokens";

export type AccessTokenPurpose = "invite" | "reset";

export const ACCESS_TOKEN_REPLACED_MESSAGE =
  "This link has expired or been replaced by a newer one. Please use the latest email.";

function expiresAtFor(purpose: AccessTokenPurpose): Date {
  if (purpose === "reset") {
    return new Date(Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  }
  return new Date(Date.now() + env.INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000);
}

/** Mark all unused tokens for a user as used (any purpose). */
export async function revokeUnusedAccessTokens(userId: string): Promise<number> {
  const result = await prisma.inviteToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count;
}

/**
 * Issue a new invite/reset link. In one transaction, revokes earlier unused
 * tokens for the same user + purpose, then creates the new hashed token.
 */
export async function issueAccessToken(
  userId: string,
  purpose: AccessTokenPurpose
): Promise<string> {
  const raw = createRawInviteToken();
  const tokenHash = hashToken(raw);
  const expiresAt = expiresAtFor(purpose);
  const now = new Date();

  await prisma.$transaction([
    prisma.inviteToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.inviteToken.create({
      data: { userId, tokenHash, purpose, expiresAt },
    }),
  ]);

  return raw;
}

/** @deprecated Use issueAccessToken(userId, "invite") */
export async function issueInviteForUser(userId: string): Promise<string> {
  return issueAccessToken(userId, "invite");
}
