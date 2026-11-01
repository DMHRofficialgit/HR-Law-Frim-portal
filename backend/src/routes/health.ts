import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      success: true,
      data: { ok: true, db: true },
      message: "API healthy",
    });
  } catch {
    return res.status(503).json({
      success: false,
      error: { code: "DB_UNAVAILABLE", message: "Database connection failed" },
      data: { ok: false, db: false },
    });
  }
});

export default router;
