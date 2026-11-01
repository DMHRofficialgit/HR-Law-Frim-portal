import { Router } from "express";
import { prisma } from "../lib/prisma";
import { clientOrgId, requireAuth, requireClient, requirePasswordSettled } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireClient, requirePasswordSettled);

router.get("/organisation", async (req, res) => {
  const organisationId = clientOrgId(req);

  const organisation = await prisma.organisation.findFirst({
    where: { id: organisationId },
    select: {
      id: true,
      name: true,
      ref: true,
      contactName: true,
      email: true,
      phone: true,
      type: true,
      onboardingStatus: true,
      status: true,
    },
  });

  if (!organisation) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Organisation not found" },
    });
  }

  return res.status(200).json({
    success: true,
    data: { organisation },
  });
});

export default router;
