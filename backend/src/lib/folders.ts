import { FolderKey, PrismaClient } from "@prisma/client";

export const FOLDER_DEFINITIONS: Array<{ key: FolderKey; name: string; sortOrder: number }> = [
  { key: FolderKey.my_documents, name: "My Documents", sortOrder: 1 },
  { key: FolderKey.my_policies, name: "My Policies", sortOrder: 2 },
  { key: FolderKey.my_handbook, name: "My Handbook", sortOrder: 3 },
  { key: FolderKey.my_contracts, name: "My Contracts", sortOrder: 4 },
  { key: FolderKey.my_useful_documents, name: "My Useful Documents", sortOrder: 5 },
  { key: FolderKey.my_private_space, name: "My Private Space", sortOrder: 6 },
  { key: FolderKey.my_onboarding, name: "My Onboarding", sortOrder: 7 },
];

export async function ensureFoldersForOrganisation(
  prisma: PrismaClient,
  organisationId: string
) {
  for (const folder of FOLDER_DEFINITIONS) {
    await prisma.documentFolder.upsert({
      where: {
        organisationId_key: {
          organisationId,
          key: folder.key,
        },
      },
      update: {
        name: folder.name,
        sortOrder: folder.sortOrder,
      },
      create: {
        organisationId,
        key: folder.key,
        name: folder.name,
        sortOrder: folder.sortOrder,
      },
    });
  }
}
