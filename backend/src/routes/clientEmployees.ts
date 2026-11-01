import { Router } from "express";
import { z } from "zod";
import { clientOrgId, requireAuth, requireClient, requirePasswordSettled } from "../middleware/auth";
import {
  createEmployee,
  deleteEmployee,
  listEmployees,
  updateEmployee,
} from "../services/employees";

const router = Router();
router.use(requireAuth, requireClient, requirePasswordSettled);

const employeeSchema = z.object({
  name: z.string().min(1),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  startDate: z.string().optional().nullable(),
  notes: z.string().optional(),
});

router.get("/employees", async (req, res) => {
  const employees = await listEmployees(clientOrgId(req));
  return res.status(200).json({ success: true, data: { employees } });
});

router.post("/employees", async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Invalid employee" },
    });
  }
  const employee = await createEmployee(clientOrgId(req), req.auth!.id, parsed.data);
  return res.status(201).json({ success: true, data: { employee }, message: "Employee created" });
});

router.patch("/employees/:id", async (req, res) => {
  const parsed = employeeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid employee payload" },
    });
  }
  const employee = await updateEmployee(clientOrgId(req), req.params.id, parsed.data);
  if (!employee) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Employee not found" },
    });
  }
  return res.status(200).json({ success: true, data: { employee }, message: "Employee updated" });
});

router.delete("/employees/:id", async (req, res) => {
  const employee = await deleteEmployee(clientOrgId(req), req.params.id);
  if (!employee) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Employee not found" },
    });
  }
  return res.status(200).json({ success: true, data: { id: employee.id }, message: "Employee deleted" });
});

export default router;
