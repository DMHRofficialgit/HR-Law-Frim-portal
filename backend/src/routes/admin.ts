import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OnboardingRunStatus, OnboardingStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { env } from "../config/env";
import {
  accessMailMessage,
  sendAccessCredentialsMail,
  type AccessMailStatus,
} from "../lib/access-mail";
import { ensureFoldersForOrganisation } from "../lib/folders";
import { normalizeNotifyEmailsInput } from "../lib/notifications";
import { prisma } from "../lib/prisma";
import { publicUser } from "../lib/tokens";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import { archivedWhere } from "../lib/archive";
import {
  archiveOrganisation,
  bulkArchiveOrganisations,
  bulkHardDeleteOrganisations,
  bulkRestoreOrganisations,
  bulkSetOrganisationStatus,
  hardDeleteOrganisation,
  restoreOrganisation,
} from "../services/organisations";
import { issueInviteForUser } from "../services/access-tokens";

const router = Router();

router.use(requireAuth, requireAdmin, requirePasswordSettled);

function serviceError(err: unknown, res: import("express").Response) {
  const e = err as { status?: number; code?: string; message?: string };
  return res.status(e.status || 500).json({
    success: false,
    error: {
      code: e.code || "SERVER_ERROR",
      message: e.message || "Unexpected error",
    },
  });
}

router.get("/organisations", async (req, res) => {
  const showArchived = String(req.query.archived || "") === "1";
  const organisations = await prisma.organisation.findMany({
    where: archivedWhere(showArchived),
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
  /** Comma-separated CC emails (no login). Empty string clears. */
  notifyEmails: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

const bulkOrgSchema = z.object({
  action: z.enum(["activate", "deactivate", "archive", "restore", "delete"]),
  ids: z.array(z.string().min(1)).min(1).max(100),
  /** Required for action=delete (purge archived) — must be exactly DELETE */
  confirmPhrase: z.string().optional(),
});

router.post("/organisations/bulk", async (req, res) => {
  const parsed = bulkOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid bulk organisation payload",
      },
    });
  }

  try {
    const { action, ids, confirmPhrase } = parsed.data;
    if (action === "activate" || action === "deactivate") {
      const status = action === "activate" ? "active" : "inactive";
      const result = await bulkSetOrganisationStatus({ ids, status });
      return res.status(200).json({
        success: true,
        data: result,
        message:
          action === "activate"
            ? `Activated ${result.updated} organisation(s)`
            : `Deactivated ${result.updated} organisation(s)`,
      });
    }

    if (action === "archive") {
      const result = await bulkArchiveOrganisations(ids);
      return res.status(200).json({
        success: true,
        data: result,
        message: `Archived ${result.updated} organisation(s)`,
      });
    }

    if (action === "restore") {
      const result = await bulkRestoreOrganisations(ids);
      return res.status(200).json({
        success: true,
        data: result,
        message: `Restored ${result.updated} organisation(s)`,
      });
    }

    const result = await bulkHardDeleteOrganisations({
      ids,
      confirmPhrase: confirmPhrase || "",
    });
    const deletedCount = result.deleted.length;
    const failedCount = result.failed.length;
    return res.status(failedCount > 0 && deletedCount === 0 ? 400 : 200).json({
      success: true,
      data: result,
      message:
        failedCount === 0
          ? `Permanently deleted ${deletedCount} organisation(s)`
          : `Deleted ${deletedCount}; ${failedCount} could not be deleted`,
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/organisations/:id/archive", async (req, res) => {
  try {
    const organisation = await archiveOrganisation(String(req.params.id));
    return res.status(200).json({
      success: true,
      data: { organisation },
      message: "Organisation archived — permanently removed after 30 days unless restored",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/organisations/:id/restore", async (req, res) => {
  try {
    const organisation = await restoreOrganisation(String(req.params.id));
    return res.status(200).json({
      success: true,
      data: { organisation },
      message: "Organisation restored",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

const deleteOrgSchema = z.object({
  confirmName: z.string().min(1),
});

router.delete("/organisations/:id", async (req, res) => {
  const parsed = deleteOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Type the organisation name to confirm permanent deletion",
      },
    });
  }

  try {
    const result = await hardDeleteOrganisation({
      organisationId: String(req.params.id),
      confirmName: parsed.data.confirmName,
      requireArchivedOrInactive: true,
    });
    return res.status(200).json({
      success: true,
      data: { organisation: result },
      message: `${result.name} permanently deleted`,
    });
  } catch (err) {
    return serviceError(err, res);
  }
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
  let notifyEmailsValue: string | null | undefined;
  if (data.notifyEmails !== undefined) {
    const normalized = normalizeNotifyEmailsInput(data.notifyEmails);
    if (!normalized.ok) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: normalized.message },
      });
    }
    notifyEmailsValue = normalized.value;
  }

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
      ...(notifyEmailsValue !== undefined ? { notifyEmails: notifyEmailsValue } : {}),
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
  /** Comma-separated CC emails (no login). */
  notifyEmails: z.string().optional(),
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

  const notifyNormalized = normalizeNotifyEmailsInput(data.notifyEmails);
  if (!notifyNormalized.ok) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: notifyNormalized.message },
    });
  }

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
      notifyEmails: notifyNormalized.value,
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

  if (parsed.data.onboardingStatus === OnboardingStatus.existing_skip) {
    const activeRun = await prisma.onboardingRun.findFirst({
      where: {
        organisationId: existing.id,
        status: OnboardingRunStatus.in_progress,
      },
      select: { id: true },
    });
    if (activeRun) {
      return res.status(409).json({
        success: false,
        error: {
          code: "INVALID_STATUS",
          message:
            "Cannot mark Already onboarded while an onboarding run is in progress — complete or wait for the run to finish first",
        },
      });
    }
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
