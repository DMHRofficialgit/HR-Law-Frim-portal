import bcrypt from "bcryptjs";
import crypto from "crypto";
import { UserRole, UserStatus } from "@prisma/client";
import { env } from "../config/env";
import {
  sendAccessCredentialsMail,
  type AccessMailPurpose,
  type AccessMailStatus,
} from "../lib/access-mail";
import { prisma } from "../lib/prisma";
import { publicUser } from "../lib/tokens";
import { issueAccessToken, issueInviteForUser } from "./access-tokens";

function httpError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  organisationId: true,
  mustChangePassword: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
  organisation: { select: { id: true, name: true } },
} as const;

export async function listPortalUsers(filter?: {
  role?: UserRole;
  organisationId?: string | null;
}) {
  return prisma.user.findMany({
    where: {
      ...(filter?.role ? { role: filter.role } : {}),
      ...(filter?.organisationId !== undefined
        ? { organisationId: filter.organisationId }
        : {}),
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: userSelect,
  });
}

export async function createPortalUser(params: {
  name: string;
  email: string;
  role: UserRole;
  organisationId?: string | null;
  authMode: "invite" | "temporary_password";
  temporaryPassword?: string;
  createdByRole: UserRole;
  createdByOrganisationId?: string | null;
}) {
  const email = params.email.trim().toLowerCase();
  const name = params.name.trim();
  if (!name || !email) {
    throw httpError("Name and email are required", 400, "VALIDATION_ERROR");
  }

  let organisationId: string | null = params.organisationId ?? null;

  if (params.role === UserRole.admin) {
    if (params.createdByRole !== UserRole.admin) {
      throw httpError("Only admins can create admin users", 403, "FORBIDDEN");
    }
    organisationId = null;
  }

  if (params.role === UserRole.client) {
    const orgId =
      params.createdByRole === UserRole.client
        ? params.createdByOrganisationId
        : params.organisationId;
    if (!orgId) {
      throw httpError("organisationId is required for company users", 400, "VALIDATION_ERROR");
    }
    if (
      params.createdByRole === UserRole.client &&
      params.createdByOrganisationId !== orgId
    ) {
      throw httpError("Cannot create users for another organisation", 403, "FORBIDDEN");
    }
    const org = await prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) throw httpError("Organisation not found", 404, "NOT_FOUND");
    organisationId = orgId;
  }

  if (params.authMode === "temporary_password" && !params.temporaryPassword) {
    throw httpError(
      "temporaryPassword is required when authMode is temporary_password",
      400,
      "VALIDATION_ERROR"
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw httpError("A user with this email already exists", 409, "EMAIL_IN_USE");
  }

  const passwordPlain =
    params.authMode === "temporary_password"
      ? params.temporaryPassword!
      : crypto.randomBytes(24).toString("hex");
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: params.role,
      organisationId,
      passwordHash,
      mustChangePassword: params.authMode === "temporary_password",
      status: UserStatus.active,
    },
    select: userSelect,
  });

  let inviteUrl: string | null = null;
  let temporaryPassword: string | null = null;
  if (params.authMode === "invite") {
    const raw = await issueInviteForUser(user.id);
    inviteUrl = `${env.FRONTEND_URL}/set-password?token=${raw}`;
  } else {
    temporaryPassword = passwordPlain;
  }

  const mailStatus: AccessMailStatus = await sendAccessCredentialsMail({
    to: user.email,
    recipientName: user.name,
    organisationName: user.organisation?.name || null,
    authMode: params.authMode,
    inviteUrl,
    temporaryPassword,
    loginUrl: `${env.FRONTEND_URL}/login`,
  });

  return { user, inviteUrl, temporaryPassword, authMode: params.authMode, mailStatus };
}

export async function setUserStatus(params: {
  userId: string;
  status: UserStatus;
  actorId: string;
  actorRole: UserRole;
  actorOrganisationId?: string | null;
}) {
  const target = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!target) throw httpError("User not found", 404, "NOT_FOUND");

  if (params.actorRole === UserRole.client) {
    if (
      target.role !== UserRole.client ||
      target.organisationId !== params.actorOrganisationId
    ) {
      throw httpError("Cannot change this user", 403, "FORBIDDEN");
    }
  }

  if (target.id === params.actorId && params.status === UserStatus.disabled) {
    throw httpError("You cannot disable your own account", 400, "VALIDATION_ERROR");
  }

  // Keep at least one active admin
  if (
    target.role === UserRole.admin &&
    params.status === UserStatus.disabled
  ) {
    const activeAdmins = await prisma.user.count({
      where: { role: UserRole.admin, status: UserStatus.active },
    });
    if (activeAdmins <= 1) {
      throw httpError("Cannot disable the last active admin", 400, "VALIDATION_ERROR");
    }
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { status: params.status },
    select: userSelect,
  });
  return user;
}

export async function resendUserInvite(params: {
  userId: string;
  actorRole: UserRole;
  actorOrganisationId?: string | null;
}) {
  const target = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!target) throw httpError("User not found", 404, "NOT_FOUND");
  if (target.status !== UserStatus.active) {
    throw httpError("User is disabled", 400, "VALIDATION_ERROR");
  }

  if (params.actorRole === UserRole.client) {
    if (
      target.role !== UserRole.client ||
      target.organisationId !== params.actorOrganisationId
    ) {
      throw httpError("Cannot invite this user", 403, "FORBIDDEN");
    }
  }

  const purpose: AccessMailPurpose = target.passwordChangedAt ? "reset" : "invite";
  const raw = await issueAccessToken(target.id, purpose);
  const inviteUrl = `${env.FRONTEND_URL}/set-password?token=${raw}`;
  const org =
    target.organisationId
      ? await prisma.organisation.findUnique({
          where: { id: target.organisationId },
          select: { name: true },
        })
      : null;

  const mailStatus: AccessMailStatus = await sendAccessCredentialsMail({
    to: target.email,
    recipientName: target.name,
    organisationName: org?.name || null,
    authMode: "invite",
    purpose,
    inviteUrl,
    loginUrl: `${env.FRONTEND_URL}/login`,
  });

  return {
    user: publicUser(target),
    inviteUrl,
    mailStatus,
    purpose,
    passwordSet: Boolean(target.passwordChangedAt),
  };
}

const BULK_RESEND_MAX = 50;

export type BulkResendInviteResult = {
  sent: number;
  failed: number;
  skipped: number;
  results: Array<{
    userId: string;
    email: string;
    status: "sent" | "failed" | "skipped";
    purpose?: AccessMailPurpose;
    mailStatus?: AccessMailStatus;
    message?: string;
  }>;
};

/**
 * Bulk resend access links for client users.
 * Default onlyPending=true → passwordChangedAt null (invite).
 * When onlyPending=false and userIds provided → invite or reset per user.
 */
export async function bulkResendUserInvites(params: {
  organisationId?: string | null;
  userIds?: string[];
  onlyPending?: boolean;
  actorRole: UserRole;
}): Promise<BulkResendInviteResult> {
  if (params.actorRole !== UserRole.admin) {
    throw httpError("Only admins can bulk-resend invites", 403, "FORBIDDEN");
  }

  const onlyPending = params.onlyPending !== false;
  const userIds = params.userIds?.length
    ? [...new Set(params.userIds.map(String).filter(Boolean))]
    : undefined;

  if (userIds && userIds.length > BULK_RESEND_MAX) {
    throw httpError(
      `Select at most ${BULK_RESEND_MAX} users at a time`,
      400,
      "VALIDATION_ERROR"
    );
  }

  const candidates = await prisma.user.findMany({
    where: {
      role: UserRole.client,
      status: UserStatus.active,
      ...(params.organisationId ? { organisationId: params.organisationId } : {}),
      ...(userIds ? { id: { in: userIds } } : {}),
      ...(onlyPending ? { passwordChangedAt: null } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      organisationId: true,
      passwordChangedAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: BULK_RESEND_MAX + 1,
  });

  if (!userIds && !params.organisationId && candidates.length === 0) {
    throw httpError(
      "Provide organisationId or userIds, or there are no pending client invites",
      400,
      "VALIDATION_ERROR"
    );
  }

  if (candidates.length > BULK_RESEND_MAX) {
    throw httpError(
      `Too many matches — select at most ${BULK_RESEND_MAX} users or narrow by organisation`,
      400,
      "VALIDATION_ERROR"
    );
  }

  if (candidates.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, results: [] };
  }

  const requestedIds = userIds ? new Set(userIds) : null;
  const foundIds = new Set(candidates.map((c) => c.id));
  const results: BulkResendInviteResult["results"] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  if (requestedIds) {
    for (const id of requestedIds) {
      if (!foundIds.has(id)) {
        skipped += 1;
        results.push({
          userId: id,
          email: "",
          status: "skipped",
          message: onlyPending
            ? "Not an active pending client invite"
            : "Not an active client user in scope",
        });
      }
    }
  }

  for (const target of candidates) {
    try {
      const result = await resendUserInvite({
        userId: target.id,
        actorRole: UserRole.admin,
      });
      if (result.mailStatus === "failed") {
        failed += 1;
        results.push({
          userId: target.id,
          email: target.email,
          status: "failed",
          purpose: result.purpose,
          mailStatus: result.mailStatus,
          message: "Mail send failed",
        });
      } else {
        sent += 1;
        results.push({
          userId: target.id,
          email: target.email,
          status: "sent",
          purpose: result.purpose,
          mailStatus: result.mailStatus,
        });
      }
    } catch (err) {
      failed += 1;
      const e = err as { message?: string };
      results.push({
        userId: target.id,
        email: target.email,
        status: "failed",
        message: e.message || "Unable to resend invite",
      });
    }
  }

  return { sent, failed, skipped, results };
}

const BULK_STATUS_MAX = 50;

export type BulkUserStatusResult = {
  updated: number;
  skipped: number;
  failed: Array<{ id: string; message: string; code?: string }>;
};

/** Bulk enable/disable portal users. Reuses setUserStatus guards (self, last admin). */
export async function bulkSetUserStatus(params: {
  ids: string[];
  status: UserStatus;
  actorId: string;
  actorRole: UserRole;
}): Promise<BulkUserStatusResult> {
  const ids = [...new Set(params.ids.map(String).filter(Boolean))];
  if (ids.length === 0) {
    throw httpError("Select at least one user", 400, "VALIDATION_ERROR");
  }
  if (ids.length > BULK_STATUS_MAX) {
    throw httpError(
      `Select at most ${BULK_STATUS_MAX} users at a time`,
      400,
      "VALIDATION_ERROR"
    );
  }

  let updated = 0;
  let skipped = 0;
  const failed: BulkUserStatusResult["failed"] = [];

  for (const id of ids) {
    try {
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) {
        failed.push({ id, message: "User not found", code: "NOT_FOUND" });
        continue;
      }
      if (target.status === params.status) {
        skipped += 1;
        continue;
      }
      await setUserStatus({
        userId: id,
        status: params.status,
        actorId: params.actorId,
        actorRole: params.actorRole,
      });
      updated += 1;
    } catch (err) {
      const e = err as { message?: string; code?: string };
      failed.push({
        id,
        message: e.message || "Unable to update user",
        code: e.code,
      });
    }
  }

  return { updated, skipped, failed };
}
