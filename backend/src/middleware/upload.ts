import multer from "multer";
import { getUploadSettings } from "../lib/uploadSettings";

const memory = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Hard ceiling; fine-grained limit checked against UploadSettings after parse
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },
});

export const singleUpload = memory.single("file");

export async function maxConfiguredBytes() {
  const settings = await getUploadSettings();
  return settings.maxUploadBytes;
}
