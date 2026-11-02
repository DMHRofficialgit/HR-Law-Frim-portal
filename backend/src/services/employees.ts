import { prisma } from "../lib/prisma";

export type EmployeeInput = {
  name: string;
  ref?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  startDate?: string | null;
  workEmail?: string | null;
  notes?: string | null;
  status?: string;
};

export type EmployeeListFilters = {
  organisationId?: string;
  status?: string;
  q?: string;
};

const employeeInclude = {
  organisation: { select: { id: true, name: true } },
  _count: { select: { cases: true } },
} as const;

const employeeDetailInclude = {
  organisation: { select: { id: true, name: true, ref: true } },
  cases: {
    select: {
      id: true,
      ref: true,
      title: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" as const },
    take: 20,
  },
};

async function nextEmployeeRef(organisationId: string): Promise<string> {
  const rows = await prisma.employee.findMany({
    where: { organisationId, ref: { not: null } },
    select: { ref: true },
  });
  let max = 0;
  for (const row of rows) {
    const m = row.ref?.match(/^EMP-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}

export async function listEmployees(filters: EmployeeListFilters = {}) {
  const q = filters.q?.trim();
  return prisma.employee.findMany({
    where: {
      ...(filters.organisationId ? { organisationId: filters.organisationId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { ref: { contains: q, mode: "insensitive" } },
              { jobTitle: { contains: q, mode: "insensitive" } },
              { department: { contains: q, mode: "insensitive" } },
              { workEmail: { contains: q, mode: "insensitive" } },
              { organisation: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: employeeInclude,
    orderBy: [{ name: "asc" }],
  });
}

export async function getEmployee(organisationId: string, id: string) {
  return prisma.employee.findFirst({
    where: { id, organisationId },
    include: employeeInclude,
  });
}

export async function getEmployeeById(id: string, organisationId?: string) {
  return prisma.employee.findFirst({
    where: {
      id,
      ...(organisationId ? { organisationId } : {}),
    },
    include: employeeDetailInclude,
  });
}

export async function createEmployee(
  organisationId: string,
  userId: string,
  data: EmployeeInput
) {
  const trimmedRef = data.ref?.trim() || "";
  const ref = trimmedRef || (await nextEmployeeRef(organisationId));

  return prisma.employee.create({
    data: {
      organisationId,
      createdById: userId,
      name: data.name.trim(),
      ref,
      jobTitle: data.jobTitle?.trim() || null,
      department: data.department?.trim() || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      workEmail: data.workEmail?.trim() || null,
      notes: data.notes?.trim() || null,
      status: data.status === "inactive" ? "inactive" : "active",
    },
    include: employeeInclude,
  });
}

export async function updateEmployee(
  organisationId: string,
  id: string,
  data: Partial<EmployeeInput>
) {
  const existing = await prisma.employee.findFirst({ where: { id, organisationId } });
  if (!existing) return null;

  let nextRef: string | null | undefined = undefined;
  if (data.ref !== undefined) {
    const trimmed = data.ref?.trim() || "";
    nextRef = trimmed || existing.ref || (await nextEmployeeRef(organisationId));
  }

  return prisma.employee.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(nextRef !== undefined ? { ref: nextRef } : {}),
      ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle?.trim() || null } : {}),
      ...(data.department !== undefined
        ? { department: data.department?.trim() || null }
        : {}),
      ...(data.startDate !== undefined
        ? { startDate: data.startDate ? new Date(data.startDate) : null }
        : {}),
      ...(data.workEmail !== undefined
        ? { workEmail: data.workEmail?.trim() || null }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      ...(data.status !== undefined
        ? { status: data.status === "inactive" ? "inactive" : "active" }
        : {}),
    },
    include: employeeInclude,
  });
}

export async function deleteEmployee(organisationId: string, id: string) {
  const existing = await prisma.employee.findFirst({
    where: { id, organisationId },
    include: { _count: { select: { cases: true } } },
  });
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  if (existing._count.cases > 0) {
    return { ok: false as const, reason: "has_cases" as const, employee: existing };
  }
  await prisma.employee.delete({ where: { id } });
  return { ok: true as const, employee: existing };
}
