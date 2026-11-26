import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import { env } from "../config/env";

export type AccessTokenClaims = {
  sub: string;
  role: "admin" | "client";
  organisationId: string | null;
  tv: number;
  sid: string;
};

export function signAccessToken(
  user: Pick<User, "id" | "role" | "organisationId" | "tokenVersion">,
  sessionId: string
): string {
  const payload: AccessTokenClaims = {
    sub: user.id,
    role: user.role,
    organisationId: user.organisationId,
    tv: user.tokenVersion,
    sid: sessionId,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: `${env.JWT_ACCESS_TTL_MINUTES}m`,
  });
}

export function createRawInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function createRawRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

/** Deterministic hash so invite/refresh tokens can be looked up by index. */
export function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organisationId: user.organisationId,
    mustChangePassword: user.mustChangePassword,
    status: user.status,
  };
}
