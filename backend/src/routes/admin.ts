import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OnboardingStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { env } from "../config/env";
import {
  accessMailMessage,
  sendAccessCredentialsMail,
  type AccessMailStatus,
} from "../lib/access-mail";
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
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          mustChangePassword: true,
          passwordChangedAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      onboardingRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          packItems: { select: { id: true, status: true, requiresSignature: true } },
        },
      },
      _count: {
        select: {
          employees: true,
          documents: true,
          cases: { where: { status: { not: "closed" } } },
        },
      },
    },
  });

  return res.status(200).json({
    success: true,
    data: {
      organisations: organisations.map(({ _count, onboardingRuns, ...o }) => ({
        ...o,
        latestOnboardingRun: onboardingRuns[0] || null,
        openCaseCount: _count.cases,
        employeeCount: _count.employees,
        documentCount: _count.documents,
      })),
    },
  });
});

router.get("/organisations/:id", async (req, res) => {
  const id = String(req.params.id);
  const organisation = await prisma.organisation.findUnique({
    where: { id },
    include: {
      users: {
        where: { role: UserRole.client },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          mustChangePassword: true,
          passwordChangedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      onboardingRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          packItems: { select: { id: true, status: true, requiresSignature: true } },
        },
      },
      _count: {
        select: {
          employees: true,
          documents: true,
          cases: { where: { status: { not: "closed" } } },
        },
      },
    },
  });

  if (!organisation) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Organisation not found" },
    });
  }

  const [recentCases, recentDocuments] = await Promise.all([
    prisma.case.findMany({
      where: { organisationId: id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        ref: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.document.findMany({
      where: { organisationId: id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        currentVersion: true,
        isSignedCopy: true,
        updatedAt: true,
        folder: { select: { id: true, name: true, key: true } },
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { fileName: true, mimeType: true, sizeBytes: true },
        },
      },
    }),
  ]);

  const { _count, onboardingRuns, ...rest } = organisation;

  return res.status(200).json({
    success: true,
    data: {
      organisation: {
        ...rest,
        openCaseCount: _count.cases,
        employeeCount: _count.employees,
        documentCount: _count.documents,
        latestOnboardingRun: onboardingRuns[0] || null,
        recentCases,
        recentDocuments: recentDocuments.map((d) => ({
          id: d.id,
          title: d.title,
          currentVersion: d.currentVersion,
          isSignedCopy: d.isSignedCopy,
          updatedAt: d.updatedAt,
          folder: d.folder,
          latestVersion: d.versions[0] || null,
        })),
      },
    },
  });
});

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  ref: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  regulatoryContext: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

router.patch("/organisations/:id", async (req, res) => {
  const parsed = updateOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid organisation payload",
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

  const data = parsed.data;
  const organisation = await prisma.organisation.update({
    where: { id: existing.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.ref !== undefined ? { ref: data.ref || null } : {}),
      ...(data.contactName !== undefined ? { contactName: data.contactName || null } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      ...(data.type !== undefined ? { type: data.type || null } : {}),
      ...(data.regulatoryContext !== undefined
        ? { regulatoryContext: data.regulatoryContext || null }
        : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
    include: {
      users: {
        where: { role: UserRole.client },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          mustChangePassword: true,
          passwordChangedAt: true,
        },
      },
    },
  });

  return res.status(200).json({
    success: true,
    data: { organisation },
    message: "Organisation updated",
  });
});

const createOrgSchema = z.object({
  name: z.string().min(1),
  ref: z.string().optional(),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  type: z.string().optional(),
  regulatoryContext: z.string().optional(),
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
      regulatoryContext: data.regulatoryContext || null,
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

  const mailStatus: AccessMailStatus = await sendAccessCredentialsMail({
    to: clientUser.email,
    recipientName: clientUser.name,
    organisationName: organisation.name,
    authMode: data.authMode,
    inviteUrl,
    temporaryPassword,
    loginUrl: `${env.FRONTEND_URL}/login`,
  });

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
      mailStatus,
    },
    message: `Organisation created — ${accessMailMessage(mailStatus, data.authMode)}`,
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
