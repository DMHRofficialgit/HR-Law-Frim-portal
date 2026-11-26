import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { clientIp } from "../lib/client-ip";
import { prisma } from "../lib/prisma";
import { hashToken, publicUser } from "../lib/tokens";
import { requireAuth } from "../middleware/auth";
import {
  changePasswordLimiter,
  inviteGetIpLimiter,
  loginEmailLimiter,
  loginIpLimiter,
  refreshIpLimiter,
  setPasswordIpLimiter,
  setPasswordTokenLimiter,
} from "../middleware/rateLimitAuth";
import { ACCESS_TOKEN_REPLACED_MESSAGE } from "../services/access-tokens";
import {
  createAuthBundle,
  isHttpError,
  refreshAuthBundle,
  revokeSessionById,
  rotateAuthAfterCredentialChange,
} from "../services/auth-sessions";

export { issueInviteForUser } from "../services/access-tokens";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const setPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

router.post("/auth/login", loginIpLimiter, loginEmailLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Valid email and password required" },
    });
  }

  const email = parsed.data.email.toLowerCase();
  const { password } = parsed.data;
  const ip = clientIp(req);

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.status !== "active") {
    await prisma.loginAudit.create({
      data: { email, success: false, ip, userId: user?.id },
    });
    return res.status(401).json({
      success: false,
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
    });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await prisma.loginAudit.create({
      data: { email, success: false, ip, userId: user.id },
    });
    return res.status(401).json({
      success: false,
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
    });
  }

  if (user.role === "client" && !user.organisationId) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Client account is not linked to an organisation" },
    });
  }

  await prisma.loginAudit.create({
    data: { email, success: true, ip, userId: user.id },
  });

  const bundle = await createAuthBundle(user);

  return res.status(200).json({
    success: true,
    data: bundle,
    message: "Logged in",
  });
});

router.post("/auth/refresh", refreshIpLimiter, async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Refresh token required" },
    });
  }

  try {
    const bundle = await refreshAuthBundle(parsed.data.refreshToken);
    return res.status(200).json({
      success: true,
      data: bundle,
      message: "Token refreshed",
    });
  } catch (err) {
    if (isHttpError(err)) {
      return res.status(err.status).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
    }
    throw err;
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.id } });
  if (!user || user.status !== "active") {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }

  return res.status(200).json({
    success: true,
    data: { user: publicUser(user) },
  });
});

/** Update signed-in profile (name). Email / role stay identity fields. */
router.patch("/auth/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid profile payload",
      },
    });
  }

  const existing = await prisma.user.findUnique({ where: { id: req.auth!.id } });
  if (!existing || existing.status !== "active") {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: { name: parsed.data.name },
  });

  return res.status(200).json({
    success: true,
    data: { user: publicUser(updated) },
    message: "Profile updated",
  });
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  if (req.auth?.sessionId) {
    await revokeSessionById(req.auth.sessionId);
  }
  return res.status(200).json({
    success: true,
    data: null,
    message: "Logged out",
  });
});

router.post(
  "/auth/change-password",
  requireAuth,
  changePasswordLimiter,
  async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message || "Invalid password payload",
        },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.auth!.id } });
    if (!user || user.status !== "active") {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!matches) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_PASSWORD", message: "Current password is incorrect" },
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });

    const bundle = await rotateAuthAfterCredentialChange(user.id);

    return res.status(200).json({
      success: true,
      data: bundle,
      message: "Password updated",
    });
  }
);

router.get("/auth/invite/:token", inviteGetIpLimiter, async (req, res) => {
  const raw = String(req.params.token || "");
  const tokenHash = hashToken(raw);

  const invite = await prisma.inviteToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });

  if (!invite || invite.user.status !== "active") {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_TOKEN", message: ACCESS_TOKEN_REPLACED_MESSAGE },
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      email: invite.user.email,
      name: invite.user.name,
    },
  });
});

router.post(
  "/auth/set-password",
  setPasswordIpLimiter,
  setPasswordTokenLimiter,
  async (req, res) => {
    const parsed = setPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message || "Invalid password payload",
        },
      });
    }

    const { token: raw, password } = parsed.data;
    const tokenHash = hashToken(raw);

    const invite = await prisma.inviteToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!invite || invite.user.status !== "active") {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_TOKEN", message: ACCESS_TOKEN_REPLACED_MESSAGE },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: invite.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: now,
          tokenVersion: { increment: 1 },
        },
      });
      await tx.inviteToken.update({
        where: { id: invite.id },
        data: { usedAt: now },
      });
      await tx.inviteToken.updateMany({
        where: { userId: invite.userId, usedAt: null, NOT: { id: invite.id } },
        data: { usedAt: now },
      });
      await tx.refreshSession.updateMany({
        where: { userId: invite.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return updated;
    });

    const bundle = await createAuthBundle(user);

    return res.status(200).json({
      success: true,
      data: bundle,
      message: "Password set",
    });
  }
);

export default router;
