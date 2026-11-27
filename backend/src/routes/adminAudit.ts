import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import { auditCategoryCounts, listAuditEvents } from "../services/audit";

const router = Router();
router.use(requireAuth, requireAdmin, requirePasswordSettled);

const categorySchema = z.enum(["all", "auth", "failures", "workspace", "system"]);

const filterSchema = z.object({
  q: z.string().optional(),
  action: z.string().optional(),
  category: categorySchema.optional(),
  organisationId: z.string().uuid().optional().or(z.literal("")),
  actor: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const querySchema = filterSchema.extend({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const parseDates = (fromRaw?: string, toRaw?: string) => {
  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to = toRaw ? new Date(toRaw) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    return { error: "Invalid date range" as const };
  }
  return { from, to };
};

router.get("/audit-events/summary", async (req, res) => {
  const parsed = filterSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid audit summary query" },
    });
  }
  const dates = parseDates(parsed.data.from, parsed.data.to);
  if ("error" in dates) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: dates.error },
    });
  }

  const counts = await auditCategoryCounts({
    q: parsed.data.q,
    organisationId: parsed.data.organisationId || undefined,
    actor: parsed.data.actor,
    from: dates.from,
    to: dates.to,
  });

  return res.status(200).json({
    success: true,
    data: { counts },
  });
});

router.get("/audit-events", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid audit query" },
    });
  }

  const dates = parseDates(parsed.data.from, parsed.data.to);
  if ("error" in dates) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: dates.error },
    });
  }

  const result = await listAuditEvents({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    q: parsed.data.q,
    action: parsed.data.action,
    category: parsed.data.category,
    organisationId: parsed.data.organisationId || undefined,
    actor: parsed.data.actor,
    from: dates.from,
    to: dates.to,
  });

  return res.status(200).json({
    success: true,
    data: result,
  });
});

export default router;
