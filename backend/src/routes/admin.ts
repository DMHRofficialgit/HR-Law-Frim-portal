import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OnboardingStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { env } from "../config/env";
import { ensureFoldersForOrganisation } from "../lib/folders";
import { prisma } from "../lib/prisma";
import { publicUser } from "../lib/tokens";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import { issueInviteForUser } from "./auth";

const router = Router();

router.use(requireAuth, requireAdmin, requirePasswordSettled);

router.get("/organisations", async (_req, res) => {
  const organisations = await prisma.organisation.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: {
        where: { role: UserRole.client },
        select: { id: true, email: true, name: true, status: true, mustChangePassword: true },
      },
    },
  });

  return res.status(200).json({
    success: true,
    data: { organisations },
  });
});

const createOrgSchema = z.object({
  name: z.string().min(1),
  ref: z.string().optional(),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  type: z.string().optional(),
  onboardingStatus: z.nativeEnum(OnboardingStatus).default(OnboardingStatus.in_progress),
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
  authMode: z.enum(["temporary_password", "invite"]),
  temporaryPassword: z.string().min(8).optional(),
});

router.post("/organisations", async (req, res) => {
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid organisation payload",
      },
    });
  }

  const data = parsed.data;
  const clientEmail = data.clientEmail.toLowerCase();

  if (data.authMode === "temporary_password" && !data.temporaryPassword) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "temporaryPassword is required when authMode is temporary_password",
      },
    });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: clientEmail } });
  if (existingUser) {
    return res.status(409).json({
      success: false,
      error: { code: "EMAIL_IN_USE", message: "A user with this email already exists" },
    });
  }

  const passwordPlain =
    data.authMode === "temporary_password"
      ? data.temporaryPassword!
      : crypto.randomBytes(24).toString("hex");

  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  const organisation = await prisma.organisation.create({
    data: {
      name: data.name,
      ref: data.ref || null,
      contactName: data.contactName || null,
      email: data.email || null,
      phone: data.phone || null,
      type: data.type || null,
      onboardingStatus: data.onboardingStatus,
      users: {
        create: {
          name: data.clientName,
          email: clientEmail,
          role: UserRole.client,
          passwordHash,
          mustChangePassword: data.authMode === "temporary_password",
        },
      },
    },
    include: {
      users: { where: { role: UserRole.client } },
    },
  });

  const clientUser = organisation.users[0];
  await ensureFoldersForOrganisation(prisma, organisation.id);

  let inviteUrl: string | null = null;
  let temporaryPassword: string | null = null;

  if (data.authMode === "invite") {
    const raw = await issueInviteForUser(clientUser.id);
    inviteUrl = `${env.FRONTEND_URL}/set-password?token=${raw}`;
  } else {
    temporaryPassword = passwordPlain;
  }

  return res.status(201).json({
    success: true,
    data: {
      organisation: {
        id: organisation.id,
        name: organisation.name,
        ref: organisation.ref,
        onboardingStatus: organisation.onboardingStatus,
        status: organisation.status,
      },
      clientUser: publicUser(clientUser),
      authMode: data.authMode,
      inviteUrl,
      temporaryPassword,
    },
    message:
      data.authMode === "invite"
        ? "Organisation created — share the invite link with the client"
        : "Organisation created — share the temporary password with the client",
  });
});

const onboardingSchema = z.object({
  onboardingStatus: z.nativeEnum(OnboardingStatus),
});

router.patch("/organisations/:id/onboarding", async (req, res) => {
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "onboardingStatus must be existing_skip, in_progress, or completed",
      },
    });
  }

  const existing = await prisma.organisation.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Organisation not found" },
    });
  }

  const organisation = await prisma.organisation.update({
    where: { id: existing.id },
    data: { onboardingStatus: parsed.data.onboardingStatus },
  });

  return res.status(200).json({
    success: true,
    data: { organisation },
    message: "Onboarding status updated",
  });
});

export default router;
