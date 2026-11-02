import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { clientOrgId, requireAuth, requireClient, requirePasswordSettled } from "../middleware/auth";
import {
  createEmployee,
  deleteEmployee,
  getEmployeeById,
  listEmployees,
  updateEmployee,
} from "../services/employees";

const router = Router();
router.use(requireAuth, requireClient, requirePasswordSettled);

const idSchema = z.string().uuid();

const employeeBodySchema = z.object({
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

const employeePatchSchema = employeeBodySchema.partial();

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

router.get("/employees", async (req, res) => {
  const status =
    typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  if (status && status !== "active" && status !== "inactive") {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid status filter" },
    });
  }
  const employees = await listEmployees({
    organisationId: clientOrgId(req),
    status,
    q,
  });
  return res.status(200).json({ success: true, data: { employees } });
});

router.get("/employees/:id", async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid employee id" },
    });
  }
  const employee = await getEmployeeById(req.params.id, clientOrgId(req));
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
  try {
    const employee = await createEmployee(clientOrgId(req), req.auth!.id, parsed.data);
    return res
      .status(201)
      .json({ success: true, data: { employee }, message: "Employee created" });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        success: false,
        error: { code: "CONFLICT", message: "Employee reference already in use" },
      });
    }
    throw err;
  }
});

router.patch("/employees/:id", async (req, res) => {
  const parsed = employeePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid employee payload" },
    });
  }
  try {
    const employee = await updateEmployee(clientOrgId(req), req.params.id, parsed.data);
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
        error: { code: "CONFLICT", message: "Employee reference already in use" },
      });
    }
    throw err;
  }
});

router.delete("/employees/:id", async (req, res) => {
  const result = await deleteEmployee(clientOrgId(req), req.params.id);
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

export default router;
