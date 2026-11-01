import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import { env } from "../config/env";

export function signAccessToken(user: Pick<User, "id" | "role" | "organisationId">) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      organisationId: user.organisationId,
    },
    env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function createRawInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

/** Deterministic hash so invite tokens can be looked up by index. */
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
