import { Router } from "express";
import { UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireClient, requirePasswordSettled } from "../middleware/auth";
import {
  createPortalUser,
  listPortalUsers,
  resendUserInvite,
  setUserStatus,
} from "../services/users";

const router = Router();
router.use(requireAuth, requireClient, requirePasswordSettled);

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
  const organisationId = req.auth!.organisationId!;
  const users = await listPortalUsers({
    role: UserRole.client,
    organisationId,
  });
  return res.status(200).json({ success: true, data: { users } });
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
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
      name: parsed.data.name,
      email: parsed.data.email,
      role: UserRole.client,
      organisationId: req.auth!.organisationId!,
      authMode: parsed.data.authMode,
      temporaryPassword: parsed.data.temporaryPassword,
      createdByRole: UserRole.client,
      createdByOrganisationId: req.auth!.organisationId!,
    });
    return res.status(201).json({
      success: true,
      data: result,
      message:
        result.authMode === "invite"
          ? "Company user created — share the invite link"
          : "Company user created — share the temporary password",
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
      actorRole: UserRole.client,
      actorOrganisationId: req.auth!.organisationId!,
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

router.post("/users/:id/invite", async (req, res) => {
  try {
    const result = await resendUserInvite({
      userId: String(req.params.id),
      actorRole: UserRole.client,
      actorOrganisationId: req.auth!.organisationId!,
    });
    return res.status(200).json({
      success: true,
      data: result,
      message: "Invite link created",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

export default router;
