import { prisma } from "./prisma";

export async function nextCaseRef() {
  const year = new Date().getFullYear();
  const prefix = `CASE-${year}-`;
  const latest = await prisma.case.findFirst({
    where: { ref: { startsWith: prefix } },
    orderBy: { ref: "desc" },
    select: { ref: true },
  });

  let n = 1;
  if (latest?.ref) {
    const part = latest.ref.slice(prefix.length);
    const parsed = Number(part);
    if (!Number.isNaN(parsed)) n = parsed + 1;
  }

  return `${prefix}${String(n).padStart(4, "0")}`;
}
