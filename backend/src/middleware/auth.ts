import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import type { AccessTokenClaims } from "../lib/tokens";
import {
  assertSessionUsable,
  isHttpError,
  touchSessionActivity,
} from "../services/auth-sessions";
import type { AuthUser } from "../types/express";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenClaims;
    if (!payload?.sub || !payload.sid || typeof payload.tv !== "number") {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || user.status !== "active") {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    if (user.tokenVersion !== payload.tv) {
      return res.status(401).json({
        success: false,
        error: { code: "TOKEN_REVOKED", message: "Session ended — please sign in again" },
      });
    }

    if (user.role === "client" && !user.organisationId) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Client account is missing organisation" },
      });
    }

    try {
      await assertSessionUsable(payload.sid, user.id);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }

    void touchSessionActivity(payload.sid).catch(() => undefined);

    const auth: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organisationId: user.organisationId,
      mustChangePassword: user.mustChangePassword,
      sessionId: payload.sid,
    };
    req.auth = auth;
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }
  if (req.auth.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Admin access required" },
    });
  }
  return next();
}

export function requireClient(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }
  if (req.auth.role !== "client" || !req.auth.organisationId) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Client access required" },
    });
  }
  return next();
}

/** Block portal/admin APIs until a temporary password has been changed. */
export function requirePasswordSettled(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.mustChangePassword) {
    return res.status(403).json({
      success: false,
      error: {
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "You must set a new password before continuing",
      },
    });
  }
  return next();
}

/** Client org id from token only — never from request body. */
export function clientOrgId(req: Request): string {
  if (!req.auth?.organisationId) {
    throw new Error("Missing organisation on client auth");
  }
  return req.auth.organisationId;
}
