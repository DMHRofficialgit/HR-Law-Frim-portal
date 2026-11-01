import { Router } from "express";
import { OnboardingPaymentKind } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import {
  canCompleteOnboarding,
  completeOnboarding,
  getOnboardingRunById,
  issuePackFromLibrary,
  linkPackItemSignature,
  listOnboardingRuns,
  sendWelcomeEmail,
  setPaymentLink,
  startOnboarding,
} from "../services/onboarding";

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

router.get("/onboarding/runs", async (_req, res) => {
  const runs = await listOnboardingRuns();
  return res.status(200).json({ success: true, data: { runs } });
});

router.get("/onboarding/runs/:id", async (req, res) => {
  const run = await getOnboardingRunById(String(req.params.id));
  if (!run) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Onboarding run not found" },
    });
  }
  const gate = canCompleteOnboarding(run);
  return res.status(200).json({
    success: true,
    data: { run, canComplete: gate.ok, completeBlockReason: gate.ok ? null : gate.reason },
  });
});

router.post("/onboarding/runs", async (req, res) => {
  try {
    const organisationId = String(req.body.organisationId || "");
    if (!organisationId) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "organisationId is required" },
      });
    }
    const run = await startOnboarding({
      organisationId,
      startedById: req.auth!.id,
    });
    return res.status(201).json({
      success: true,
      data: { run },
      message: "Onboarding started — send welcome email next",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/onboarding/runs/:id/welcome-email", async (req, res) => {
  try {
    const run = await sendWelcomeEmail({
      runId: String(req.params.id),
      subject: typeof req.body.subject === "string" ? req.body.subject : undefined,
      body: typeof req.body.body === "string" ? req.body.body : undefined,
    });
    return res.status(200).json({
      success: true,
      data: { run },
      message: "Welcome email sent",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/onboarding/runs/:id/issue-pack", async (req, res) => {
  try {
    const ids = Array.isArray(req.body.libraryDocumentIds)
      ? (req.body.libraryDocumentIds as unknown[]).map(String)
      : [];
    const run = await issuePackFromLibrary({
      runId: String(req.params.id),
      libraryDocumentIds: ids,
      issuedById: req.auth!.id,
    });
    return res.status(200).json({
      success: true,
      data: { run },
      message: "Pack issued to My Onboarding",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/onboarding/pack-items/:id/link-signature", async (req, res) => {
  try {
    const signatureRequestId = String(req.body.signatureRequestId || "");
    if (!signatureRequestId) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "signatureRequestId is required" },
      });
    }
    const item = await linkPackItemSignature({
      packItemId: String(req.params.id),
      signatureRequestId,
    });
    return res.status(200).json({ success: true, data: { item } });
  } catch (err) {
    return serviceError(err, res);
  }
});

const paymentSchema = z.object({
  kind: z.nativeEnum(OnboardingPaymentKind),
  url: z.string().url(),
});

router.put("/onboarding/runs/:id/payment-links", async (req, res) => {
  try {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message || "Invalid payment link",
        },
      });
    }
    const run = await setPaymentLink({
      runId: String(req.params.id),
      kind: parsed.data.kind,
      url: parsed.data.url,
    });
    return res.status(200).json({ success: true, data: { run }, message: "Payment link saved" });
  } catch (err) {
    return serviceError(err, res);
  }
});

router.post("/onboarding/runs/:id/complete", async (req, res) => {
  try {
    const run = await completeOnboarding({
      runId: String(req.params.id),
      completedById: req.auth!.id,
    });
    return res.status(200).json({
      success: true,
      data: { run },
      message: "Onboarding complete — company is a full DM.HR client",
    });
  } catch (err) {
    return serviceError(err, res);
  }
});

export default router;
