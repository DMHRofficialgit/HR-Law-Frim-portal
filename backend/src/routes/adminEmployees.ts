import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, requirePasswordSettled } from "../middleware/auth";
import {
  createEmployee,
  deleteEmployee,
  listEmployees,
  updateEmployee,
} from "../services/employees";

const router = Router();
router.use(requireAuth, requireAdmin, requirePasswordSettled);

const orgIdSchema = z.string().uuid();
const employeeSchema = z.object({
  name: z.string().min(1),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  startDate: z.string().optional().nullable(),
  notes: z.string().optional(),
  status: z.string().optional(),
});

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
  const employees = await listEmployees(organisationId);
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
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Invalid employee" },
    });
  }
  const employee = await createEmployee(organisationId, req.auth!.id, parsed.data);
  return res.status(201).json({ success: true, data: { employee }, message: "Employee created" });
});

router.patch("/organisations/:organisationId/employees/:id", async (req, res) => {
  const { organisationId, id } = req.params;
  if (!orgIdSchema.safeParse(organisationId).success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid organisation id" },
    });
  }
  const parsed = employeeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid employee payload" },
    });
  }
  const employee = await updateEmployee(organisationId, id, parsed.data);
  if (!employee) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Employee not found" },
    });
  }
  return res.status(200).json({ success: true, data: { employee }, message: "Employee updated" });
});

router.delete("/organisations/:organisationId/employees/:id", async (req, res) => {
  const { organisationId, id } = req.params;
  const employee = await deleteEmployee(organisationId, id);
  if (!employee) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Employee not found" },
    });
  }
  return res.status(200).json({ success: true, data: { id: employee.id }, message: "Employee deleted" });
});

export default router;
