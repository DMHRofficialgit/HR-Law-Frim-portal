import { PrismaClient } from "@prisma/client";

/** Six system vault folders — keys match client FolderKey (not My Onboarding). */
export const FIRM_STAGING_SYSTEM_FOLDER_DEFINITIONS: Array<{
  key: string;
  name: string;
  sortOrder: number;
}> = [
  { key: "my_documents", name: "My Documents", sortOrder: 1 },
  { key: "my_policies", name: "My Policies", sortOrder: 2 },
  { key: "my_handbook", name: "My Handbook", sortOrder: 3 },
  { key: "my_contracts", name: "My Contracts", sortOrder: 4 },
  { key: "my_useful_documents", name: "My Useful Documents", sortOrder: 5 },
  { key: "my_private_space", name: "My Private Space", sortOrder: 6 },
];

export const FIRM_STAGING_SYSTEM_KEYS = new Set(
  FIRM_STAGING_SYSTEM_FOLDER_DEFINITIONS.map((f) => f.key)
);

export async function ensureFirmStagingFolders(prisma: PrismaClient): Promise<void> {
  for (const folder of FIRM_STAGING_SYSTEM_FOLDER_DEFINITIONS) {
    await prisma.firmStagingFolder.upsert({
      where: { key: folder.key },
      update: {
        name: folder.name,
        sortOrder: folder.sortOrder,
        isSystem: true,
      },
      create: {
        key: folder.key,
        name: folder.name,
        sortOrder: folder.sortOrder,
        isSystem: true,
      },
    });
  }
}

export function slugifyStagingFolderName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || "folder";
}
