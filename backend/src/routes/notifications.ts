import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePasswordSettled } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requirePasswordSettled);

router.get("/notifications", async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.auth!.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return res.status(200).json({ success: true, data: { notifications } });
});

router.get("/notifications/unread-count", async (req, res) => {
  const unreadCount = await prisma.notification.count({
    where: { userId: req.auth!.id, readAt: null },
  });
  return res.status(200).json({ success: true, data: { unreadCount } });
});

router.post("/notifications/:id/read", async (req, res) => {
  const existing = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.auth!.id },
  });
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Notification not found" },
    });
  }
  const notification = await prisma.notification.update({
    where: { id: existing.id },
    data: { readAt: new Date() },
  });
  return res.status(200).json({ success: true, data: { notification } });
});

router.post("/notifications/read-all", async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.auth!.id, readAt: null },
    data: { readAt: new Date() },
  });
  return res.status(200).json({ success: true, data: null, message: "All marked read" });
});

export default router;
