import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { clientIp } from "../lib/client-ip";
import { prisma } from "../lib/prisma";

export type AuditAction =
  | "auth.login_success"
  | "auth.login_failure"
  | "auth.logout"
  | "auth.password_change"
  | "auth.password_set"
  | "user.invite"
  | "user.reset_link"
  | "user.disable"
  | "user.enable"
  | "document.upload"
  | "document.download"
  | "document.rename"
  | "document.delete"
  | "case.create"
  | "case.status_change"
  | "case.message"
  | "case.attachment_upload"
  | "case.attachment_download"
  | "case.attachment_delete"
  | "case.archive"
  | "case.restore"
  | "case.purge"
  | "organisation.create"
  | "organisation.update"
  | "organisation.archive"
  | "organisation.restore"
  | "organisation.purge"
  | "employee.create"
  | "employee.update"
  | "employee.archive"
  | "employee.restore"
  | "employee.delete"
  | "signature.create"
  | "signature.send"
  | "signature.mark_ready"
  | "signature.sign"
  | "signature.review"
  | "signature.revision"
  | "signature.reupload"
  | "firm_library.upload"
  | "firm_library.delete"
  | "firm_staging.upload"
  | "firm_staging.delete"
  | "firm_staging.copy_to_client"
  | "settings.smtp_save"
  | "settings.upload_save"
  | "settings.template_update"
  | "settings.template_test"
  | "ops.archive_purge"
  | "ops.audit_retention_purge"
  | string;

export type RecordAuditInput = {
  action: AuditAction;
  entityType: string;
  summary: string;
  entityId?: string | null;
  organisationId?: string | null;
  organisationName?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  ip?: string | null;
  meta?: Prisma.InputJsonValue;
};

/**
 * Insert-only audit writer (#10). Never throws into the caller path.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || null,
        organisationId: input.organisationId || null,
        organisationName: input.organisationName || null,
        summary: input.summary.slice(0, 500),
        actorUserId: input.actorUserId || null,
        actorEmail: input.actorEmail || null,
        actorRole: input.actorRole || null,
        ip: input.ip || null,
        meta: input.meta ?? undefined,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record", input.action, err);
  }
}

/** Fill actor + IP from an Express request (auth optional). */
export function auditActorFromReq(req: Request): Pick<
  RecordAuditInput,
  "actorUserId" | "actorEmail" | "actorRole" | "ip"
> {
  return {
    actorUserId: req.auth?.id || null,
    actorEmail: req.auth?.email || null,
    actorRole: req.auth?.role || null,
    ip: clientIp(req),
  };
}

export async function recordAuditFromReq(
  req: Request,
  input: Omit<RecordAuditInput, "actorUserId" | "actorEmail" | "actorRole" | "ip"> &
    Partial<Pick<RecordAuditInput, "actorUserId" | "actorEmail" | "actorRole" | "ip">>
): Promise<void> {
  const fromReq = auditActorFromReq(req);
  await recordAudit({
    ...fromReq,
    ...input,
    actorUserId: input.actorUserId ?? fromReq.actorUserId,
    actorEmail: input.actorEmail ?? fromReq.actorEmail,
    actorRole: input.actorRole ?? fromReq.actorRole,
    ip: input.ip ?? fromReq.ip,
  });
}

export type AuditListCategory =
  | "all"
  | "auth"
  | "failures"
  | "workspace"
  | "system";

export type ListAuditEventsParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  action?: string;
  category?: AuditListCategory;
  organisationId?: string;
  actor?: string;
  from?: Date;
  to?: Date;
};

const workspaceActionOr: Prisma.AuditEventWhereInput[] = [
  { action: { startsWith: "document." } },
  { action: { startsWith: "case." } },
  { action: { startsWith: "organisation." } },
  { action: { startsWith: "employee." } },
  { action: { startsWith: "signature." } },
  { action: { startsWith: "user." } },
  { action: { startsWith: "firm_library." } },
  { action: { startsWith: "firm_staging." } },
];

const systemActionOr: Prisma.AuditEventWhereInput[] = [
  { action: { startsWith: "ops." } },
  { action: { startsWith: "settings." } },
];

function buildAuditWhere(
  params: Omit<ListAuditEventsParams, "page" | "pageSize">
): Prisma.AuditEventWhereInput {
  const where: Prisma.AuditEventWhereInput = {};
  const and: Prisma.AuditEventWhereInput[] = [];

  if (params.action?.trim()) {
    where.action = params.action.trim();
  } else {
    const category = params.category || "all";
    if (category === "auth") {
      and.push({ action: { startsWith: "auth." } });
    } else if (category === "failures") {
      and.push({ action: "auth.login_failure" });
    } else if (category === "workspace") {
      and.push({ OR: workspaceActionOr });
    } else if (category === "system") {
      and.push({ OR: systemActionOr });
    }
  }

  if (params.organisationId?.trim()) {
    where.organisationId = params.organisationId.trim();
  }
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = params.from;
    if (params.to) where.createdAt.lte = params.to;
  }

  const q = params.q?.trim();
  const actor = params.actor?.trim();
  if (q) {
    and.push({
      OR: [
        { summary: { contains: q, mode: "insensitive" } },
        { actorEmail: { contains: q, mode: "insensitive" } },
        { organisationName: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (actor) {
    and.push({
      OR: [
        { actorEmail: { contains: actor, mode: "insensitive" } },
        { actorUserId: actor },
      ],
    });
  }
  if (and.length) where.AND = and;
  return where;
}

export async function listAuditEvents(params: ListAuditEventsParams) {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 25));
  const where = buildAuditWhere(params);

  const [total, events] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { events, total, page, pageSize };
}

export async function auditCategoryCounts(
  params: Omit<ListAuditEventsParams, "page" | "pageSize" | "action" | "category">
): Promise<Record<AuditListCategory, number>> {
  const base = buildAuditWhere({ ...params, category: "all" });
  const [all, auth, failures, workspace, system] = await Promise.all([
    prisma.auditEvent.count({ where: base }),
    prisma.auditEvent.count({
      where: { AND: [base, { action: { startsWith: "auth." } }] },
    }),
    prisma.auditEvent.count({
      where: { AND: [base, { action: "auth.login_failure" }] },
    }),
    prisma.auditEvent.count({
      where: { AND: [base, { OR: workspaceActionOr }] },
    }),
    prisma.auditEvent.count({
      where: { AND: [base, { OR: systemActionOr }] },
    }),
  ]);
  return { all, auth, failures, workspace, system };
}
