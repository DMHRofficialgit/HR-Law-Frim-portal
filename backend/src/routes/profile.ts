import { Router } from "express";
import { z } from "zod";
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
} from "../lib/notifications";
import { prisma } from "../lib/prisma";
import { publicUser } from "../lib/tokens";
import { requireAuth, requirePasswordSettled } from "../middleware/auth";
import { singleUpload } from "../middleware/upload";
import {
  absoluteSignaturePath,
  addProfileSignature,
  clearAllProfileSignatures,
  deleteProfileSignature,
  getProfileSignaturePath,
  listProfileSignatures,
  setDefaultProfileSignature,
} from "../services/profileSignatures";

const router = Router();
router.use(requireAuth, requirePasswordSettled);

const notifyPrefsSchema = z.object({
  emailCases: z.boolean().optional(),
  emailDocuments: z.boolean().optional(),
  emailSignatures: z.boolean().optional(),
  emailOnboarding: z.boolean().optional(),
});

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

router.get("/me/notification-preferences", async (req, res) => {
  const preferences = await getNotificationPrefs(req.auth!.id);
  return res.status(200).json({ success: true, data: { preferences } });
});

router.patch("/me/notification-preferences", async (req, res) => {
  const parsed = notifyPrefsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid preferences",
      },
    });
  }
  const preferences = await upsertNotificationPrefs(req.auth!.id, parsed.data);
  return res.status(200).json({
    success: true,
    data: { preferences },
    message: "Notification preferences saved",
  });
});

router.get("/me/signature", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.id } });
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "User not found" },
    });
  }
  const list = await listProfileSignatures(user.id);
  return res.status(200).json({
    success: true,
    data: {
      ...list,
      hasSignature: list.hasSignature,
      user: {
        ...publicUser(user),
        hasSignature: list.hasSignature,
      },
    },
  });
});

/** Legacy: default signature image */
router.get("/me/signature/image", async (req, res) => {
  const relative = await getProfileSignaturePath(req.auth!.id);
  if (!relative) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "No signature saved" },
    });
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", 'inline; filename="signature.png"');
  return res.sendFile(absoluteSignaturePath(relative));
});

router.get("/me/signature/:id/image", async (req, res) => {
  const relative = await getProfileSignaturePath(req.auth!.id, String(req.params.id));
  if (!relative) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Signature not found" },
    });
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", 'inline; filename="signature.png"');
  return res.sendFile(absoluteSignaturePath(relative));
});

router.post("/me/signature", singleUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "PNG signature file is required" },
      });
    }
    const list = await addProfileSignature({
      userId: req.auth!.id,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    const user = await prisma.user.findUnique({ where: { id: req.auth!.id } });
    return res.status(200).json({
      success: true,
      data: {
        ...list,
        user: user
          ? { ...publicUser(user), hasSignature: list.hasSignature }
          : undefined,
      },
      message: "Signature saved",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/me/signature/:id/default", async (req, res) => {
  try {
    const list = await setDefaultProfileSignature(req.auth!.id, String(req.params.id));
    return res.status(200).json({
      success: true,
      data: list,
      message: "Default signature updated",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.delete("/me/signature/:id", async (req, res) => {
  try {
    const list = await deleteProfileSignature(req.auth!.id, String(req.params.id));
    return res.status(200).json({
      success: true,
      data: list,
      message: "Signature removed",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

/** Legacy: clear all saved signatures */
router.delete("/me/signature", async (req, res) => {
  try {
    const list = await clearAllProfileSignatures(req.auth!.id);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.id } });
    return res.status(200).json({
      success: true,
      data: {
        ...list,
        user: user
          ? { ...publicUser(user), hasSignature: false }
          : undefined,
      },
      message: "Signatures cleared",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

export default router;
