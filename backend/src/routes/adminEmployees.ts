import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import {
  createEmployee,
  deleteEmployee,
  getEmployeeById,
  listEmployees,
  updateEmployee,
} from "../services/employees";

const router = Router();
router.use(requireAuth, requireAdmin, requirePasswordSettled);

const orgIdSchema = z.string().uuid();
const idSchema = z.string().uuid();

const employeeBodySchema = z.object({
  organisationId: z.string().uuid().optional(),
  name: z.string().min(1),
  ref: z.string().optional().nullable(),
  jobTitle: z.string().min(1),
  department: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  workEmail: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().email().nullable().optional()
  ),
  notes: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

const employeePatchSchema = employeeBodySchema.partial().omit({ organisationId: true });

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

router.get("/employees", async (req, res) => {
  const organisationId =
    typeof req.query.organisationId === "string" && req.query.organisationId
      ? req.query.organisationId
      : undefined;
  const status =
    typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;

  if (organisationId && !orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }
  if (status && status !== "active" && status !== "inactive") {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid status filter" },
    });
  }

  const employees = await listEmployees({ organisationId, status, q });
  return res.status(200).json({ success: true, data: { employees } });
});

router.get("/employees/:id", async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid employee id" },
    });
  }
  const employee = await getEmployeeById(req.params.id);
  if (!employee) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Employee not found" },
    });
  }
  return res.status(200).json({ success: true, data: { employee } });
});

router.post("/employees", async (req, res) => {
  const parsed = employeeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid employee",
      },
    });
  }
  const organisationId = parsed.data.organisationId;
  if (!organisationId) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "organisationId is required" },
    });
  }
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!org) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Organisation not found" },
    });
  }

  try {
    const employee = await createEmployee(organisationId, req.auth!.id, parsed.data);
    return res
      .status(201)
      .json({ success: true, data: { employee }, message: "Employee created" });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        success: false,
        error: { code: "CONFLICT", message: "Employee reference already in use for this client" },
      });
    }
    throw err;
  }
});

/** Legacy org-scoped list (profile / deep links) */
router.get("/organisations/:organisationId/employees", async (req, res) => {
  const organisationId = req.params.organisationId;
  if (!orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!org) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Organisation not found" },
    });
  }
  const employees = await listEmployees({ organisationId });
  return res.status(200).json({ success: true, data: { employees } });
});

router.post("/organisations/:organisationId/employees", async (req, res) => {
  const organisationId = req.params.organisationId;
  if (!orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }
  const parsed = employeeBodySchema.omit({ organisationId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message || "Invalid employee",
      },
    });
  }
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!org) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Organisation not found" },
    });
  }
  try {
    const employee = await createEmployee(organisationId, req.auth!.id, parsed.data);
    return res
      .status(201)
      .json({ success: true, data: { employee }, message: "Employee created" });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        success: false,
        error: { code: "CONFLICT", message: "Employee reference already in use for this client" },
      });
    }
    throw err;
  }
});

router.patch("/organisations/:organisationId/employees/:id", async (req, res) => {
  const { organisationId, id } = req.params;
  if (!orgIdSchema.safeParse(organisationId).success || !idSchema.safeParse(id).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid id" },
    });
  }
  const parsed = employeePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid employee payload" },
    });
  }
  try {
    const employee = await updateEmployee(organisationId, id, parsed.data);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Employee not found" },
      });
    }
    return res.status(200).json({ success: true, data: { employee }, message: "Employee updated" });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        success: false,
        error: { code: "CONFLICT", message: "Employee reference already in use for this client" },
      });
    }
    throw err;
  }
});

router.patch("/employees/:id", async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid employee id" },
    });
  }
  const existing = await getEmployeeById(req.params.id);
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Employee not found" },
    });
  }
  const parsed = employeePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid employee payload" },
    });
  }
  try {
    const employee = await updateEmployee(existing.organisationId, existing.id, parsed.data);
    return res.status(200).json({ success: true, data: { employee }, message: "Employee updated" });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        success: false,
        error: { code: "CONFLICT", message: "Employee reference already in use for this client" },
      });
    }
    throw err;
  }
});

router.delete("/organisations/:organisationId/employees/:id", async (req, res) => {
  const { organisationId, id } = req.params;
  const result = await deleteEmployee(organisationId, id);
  if (!result.ok && result.reason === "not_found") {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Employee not found" },
    });
  }
  if (!result.ok && result.reason === "has_cases") {
    return res.status(409).json({
      success: false,
      error: {
        code: "HAS_CASES",
        message: "This employee has linked cases. Deactivate instead of deleting.",
      },
    });
  }
  return res
    .status(200)
    .json({ success: true, data: { id: result.employee.id }, message: "Employee deleted" });
});

router.delete("/employees/:id", async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid employee id" },
    });
  }
  const existing = await getEmployeeById(req.params.id);
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Employee not found" },
    });
  }
  const result = await deleteEmployee(existing.organisationId, existing.id);
  if (!result.ok && result.reason === "has_cases") {
    return res.status(409).json({
      success: false,
      error: {
        code: "HAS_CASES",
        message: "This employee has linked cases. Deactivate instead of deleting.",
      },
    });
  }
  return res
    .status(200)
    .json({ success: true, data: { id: existing.id }, message: "Employee deleted" });
});

export default router;
