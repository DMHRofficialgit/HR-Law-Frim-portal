import bcrypt from "bcryptjs";
import crypto from "crypto";
import { UserRole, UserStatus } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { publicUser } from "../lib/tokens";
import { issueInviteForUser } from "../routes/auth";

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

  return { user, inviteUrl, temporaryPassword, authMode: params.authMode };
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

  const raw = await issueInviteForUser(target.id);
  return {
    user: publicUser(target),
    inviteUrl: `${env.FRONTEND_URL}/set-password?token=${raw}`,
  };
}
