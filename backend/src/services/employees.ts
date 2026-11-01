import { prisma } from "../lib/prisma";

export async function listEmployees(organisationId: string) {
  return prisma.employee.findMany({
    where: { organisationId },
    orderBy: { name: "asc" },
  });
}

export async function getEmployee(organisationId: string, id: string) {
  return prisma.employee.findFirst({ where: { id, organisationId } });
}

export async function createEmployee(
  organisationId: string,
  userId: string,
  data: {
    name: string;
    jobTitle?: string;
    department?: string;
    startDate?: string | null;
    notes?: string;
  }
) {
  return prisma.employee.create({
    data: {
      organisationId,
      createdById: userId,
      name: data.name,
      jobTitle: data.jobTitle || null,
      department: data.department || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      notes: data.notes || null,
    },
  });
}

export async function updateEmployee(
  organisationId: string,
  id: string,
  data: {
    name?: string;
    jobTitle?: string | null;
    department?: string | null;
    startDate?: string | null;
    notes?: string | null;
    status?: string;
  }
) {
  const existing = await getEmployee(organisationId, id);
  if (!existing) return null;

  return prisma.employee.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle } : {}),
      ...(data.department !== undefined ? { department: data.department } : {}),
      ...(data.startDate !== undefined
        ? { startDate: data.startDate ? new Date(data.startDate) : null }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  });
}

export async function deleteEmployee(organisationId: string, id: string) {
  const existing = await getEmployee(organisationId, id);
  if (!existing) return null;
  await prisma.employee.delete({ where: { id } });
  return existing;
}
