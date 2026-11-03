import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { createRawInviteToken, hashToken, publicUser, signAccessToken } from "../lib/tokens";
import { requireAuth } from "../middleware/auth";

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

function clientIp(req: { headers: Record<string, unknown>; socket: { remoteAddress?: string } }) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || null;
}

router.post("/auth/login", async (req, res) => {
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

  const token = signAccessToken(user);

  return res.status(200).json({
    success: true,
    data: {
      token,
      user: publicUser(user),
    },
    message: "Logged in",
  });
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

router.post("/auth/logout", requireAuth, (_req, res) => {
  return res.status(200).json({
    success: true,
    data: null,
    message: "Logged out — clear the token on the client",
  });
});

router.post("/auth/change-password", requireAuth, async (req, res) => {
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
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });

  const token = signAccessToken(updated);

  return res.status(200).json({
    success: true,
    data: {
      token,
      user: publicUser(updated),
    },
    message: "Password updated",
  });
});

router.get("/auth/invite/:token", async (req, res) => {
  const raw = req.params.token;
  const tokenHash = hashToken(raw);

  const invite = await prisma.inviteToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });

  if (!invite || invite.user.status !== "active") {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_TOKEN", message: "Invite link is invalid or expired" },
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

router.post("/auth/set-password", async (req, res) => {
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
      error: { code: "INVALID_TOKEN", message: "Invite link is invalid or expired" },
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: invite.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    }),
    prisma.inviteToken.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    }),
  ]);

  const accessToken = signAccessToken(user);

  return res.status(200).json({
    success: true,
    data: {
      token: accessToken,
      user: publicUser(user),
    },
    message: "Password set",
  });
});

/** Helper used by admin routes — not a public route */
export async function issueInviteForUser(userId: string) {
  const raw = createRawInviteToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  await prisma.inviteToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return raw;
}

export default router;
