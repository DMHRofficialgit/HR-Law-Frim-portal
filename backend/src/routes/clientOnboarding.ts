import { Router } from "express";
import { requireAuth, requireClient, requirePasswordSettled } from "../middleware/auth";
import { getClientJourney } from "../services/onboarding";

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

router.get("/onboarding", async (req, res) => {
  try {
    const data = await getClientJourney(req.auth!.organisationId!);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return serviceError(err, res);
  }
});

export default router;
