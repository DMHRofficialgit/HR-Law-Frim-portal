import { Router } from "express";
import { UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";
import { accessMailMessage } from "../lib/access-mail";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import {
  bulkResendUserInvites,
  createPortalUser,
  listPortalUsers,
  resendUserInvite,
  setUserStatus,
} from "../services/users";

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

router.get("/users", async (req, res) => {
  const role =
    req.query.role === "admin" || req.query.role === "client"
      ? (req.query.role as UserRole)
      : undefined;
  const organisationId =
    typeof req.query.organisationId === "string" ? req.query.organisationId : undefined;
  const users = await listPortalUsers({
    role,
    organisationId: organisationId === "" ? null : organisationId,
  });
  return res.status(200).json({ success: true, data: { users } });
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  organisationId: z.string().uuid().optional().nullable(),
  authMode: z.enum(["invite", "temporary_password"]),
  temporaryPassword: z.string().min(8).optional(),
});

router.post("/users", async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message || "Invalid payload",
        },
      });
    }
    const result = await createPortalUser({
      ...parsed.data,
      createdByRole: UserRole.admin,
    });
    return res.status(201).json({
      success: true,
      data: result,
      message: `User created — ${accessMailMessage(result.mailStatus, result.authMode)}`,
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.patch("/users/:id/status", async (req, res) => {
  try {
    const status = req.body?.status;
    if (status !== UserStatus.active && status !== UserStatus.disabled) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "status must be active or disabled" },
      });
    }
    const user = await setUserStatus({
      userId: String(req.params.id),
      status,
      actorId: req.auth!.id,
      actorRole: UserRole.admin,
    });
    return res.status(200).json({
      success: true,
      data: { user },
      message: status === "disabled" ? "User disabled" : "User enabled",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

const bulkResendSchema = z
  .object({
    organisationId: z.string().uuid().optional().nullable(),
    userIds: z.array(z.string().min(1)).max(50).optional(),
    /** Default true — only clients who have never set a password. */
    onlyPending: z.boolean().optional(),
  })
  .refine(
    (data) =>
      Boolean(data.organisationId) ||
      (Array.isArray(data.userIds) && data.userIds.length > 0),
    { message: "Provide organisationId or userIds" }
  );

router.post("/users/resend-invites", async (req, res) => {
  const parsed = bulkResendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid bulk resend payload",
      },
    });
  }

  try {
    const result = await bulkResendUserInvites({
      organisationId: parsed.data.organisationId || undefined,
      userIds: parsed.data.userIds,
      onlyPending: parsed.data.onlyPending,
      actorRole: UserRole.admin,
    });
    return res.status(200).json({
      success: true,
      data: result,
      message: `Invites: sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped}`,
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/users/:id/invite", async (req, res) => {
  try {
    const result = await resendUserInvite({
      userId: String(req.params.id),
      actorRole: UserRole.admin,
    });
    return res.status(200).json({
      success: true,
      data: result,
      message: `${result.purpose === "reset" ? "Password reset" : "Invite refreshed"} — ${accessMailMessage(result.mailStatus, "invite", result.purpose)}`,
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

export default router;
