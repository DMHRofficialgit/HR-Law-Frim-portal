import { prisma } from "./prisma";

export const SYSTEM_CASE_CATEGORIES = [
  { name: "Grievance", sortOrder: 1 },
  { name: "Disciplinary", sortOrder: 2 },
  { name: "Occupational Health", sortOrder: 3 },
  { name: "Absence Management", sortOrder: 4 },
  { name: "Request for document", sortOrder: 5 },
  { name: "Other", sortOrder: 6 },
];

export async function ensureSystemCaseCategories() {
  for (const cat of SYSTEM_CASE_CATEGORIES) {
    await prisma.caseCategory.upsert({
      where: { name: cat.name },
      update: { isSystem: true, sortOrder: cat.sortOrder, active: true },
      create: {
        name: cat.name,
        isSystem: true,
        sortOrder: cat.sortOrder,
        active: true,
      },
    });
  }
}
