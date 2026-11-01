import { prisma } from "./prisma";

export const DEFAULT_UPLOAD_SETTINGS = {
  allowedExtensions: ["pdf", "doc", "docx"],
  allowedMimeTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  maxUploadBytes: 25 * 1024 * 1024,
};

export async function getUploadSettings() {
  const existing = await prisma.uploadSettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;

  return prisma.uploadSettings.create({
    data: {
      id: "default",
      ...DEFAULT_UPLOAD_SETTINGS,
    },
  });
}

export function extensionOf(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1] || "";
}
