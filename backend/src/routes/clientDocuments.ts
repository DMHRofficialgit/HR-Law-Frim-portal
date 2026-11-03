import { FolderKey, OnboardingStatus } from "@prisma/client";
import { Router } from "express";
import { clientOrgId, requireAuth, requireClient, requirePasswordSettled } from "../middleware/auth";
import { singleUpload } from "../middleware/upload";
import { ensureFoldersForOrganisation } from "../lib/folders";
import { prisma } from "../lib/prisma";
import { listFolders } from "../services/documents";
import {
  handleDelete,
  handleDownload,
  handleGetUploadSettings,
  handleListDocuments,
  handleRename,
  handleUpload,
  handleVersions,
} from "./documentsShared";

const router = Router();

router.use(requireAuth, requireClient, requirePasswordSettled);

router.get("/folders", async (req, res) => {
  const organisationId = clientOrgId(req);
  await ensureFoldersForOrganisation(prisma, organisationId);
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { onboardingStatus: true },
  });
  const folders = await listFolders(organisationId);
  const activeRun =
    org?.onboardingStatus === OnboardingStatus.existing_skip
      ? await prisma.onboardingRun.findFirst({
          where: {
            organisationId,
            status: "in_progress",
          },
          select: { id: true },
        })
      : null;
  const hideOnboarding =
    org?.onboardingStatus === OnboardingStatus.existing_skip && !activeRun;
  const visible = hideOnboarding
    ? folders.filter((f) => f.key !== FolderKey.my_onboarding)
    : folders;
  return res.status(200).json({
    success: true,
    data: {
      folders: visible.map((f) => ({
        id: f.id,
        key: f.key,
        name: f.name,
        sortOrder: f.sortOrder,
        documentCount: f._count.documents,
      })),
    },
  });
});

router.get("/folders/:folderId/documents", async (req, res) => {
  return handleListDocuments(clientOrgId(req), req.params.folderId, res);
});

router.post("/folders/:folderId/documents", (req, res) => {
  singleUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: { code: "UPLOAD_ERROR", message: err.message || "Upload failed" },
      });
    }
    return handleUpload(req, res, clientOrgId(req), req.params.folderId);
  });
});

router.get("/documents/:documentId/versions", async (req, res) => {
  return handleVersions(clientOrgId(req), req.params.documentId, res);
});

router.get("/documents/:documentId/download", async (req, res) => {
  return handleDownload(clientOrgId(req), req.params.documentId, req, res);
});

router.patch("/documents/:documentId", async (req, res) => {
  return handleRename(clientOrgId(req), req.params.documentId, req, res);
});

router.delete("/documents/:documentId", async (req, res) => {
  return handleDelete(clientOrgId(req), req.params.documentId, res);
});

router.get("/upload-settings", async (_req, res) => {
  return handleGetUploadSettings(res);
});

export default router;
