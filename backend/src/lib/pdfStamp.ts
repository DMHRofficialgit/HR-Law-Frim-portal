import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs/promises";
import { absoluteStoragePath } from "./storage";

export type StampField = {
  page: number;
  /** Normalized 0–1 from top-left of page (UI coords) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** PNG relative path (signature / initials / rendered text) */
  imageRelativePath?: string | null;
  /** Plain text drawn with Helvetica when no image (text / date / name) */
  text?: string | null;
};

/** Burn field images/text onto a PDF copy. Returns stamped PDF bytes. */
export async function stampSignaturesOnPdf(
  sourceRelativePath: string,
  fields: StampField[]
): Promise<Buffer> {
  const sourceBytes = await fs.readFile(absoluteStoragePath(sourceRelativePath));
  const pdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const field of fields) {
    const pageIndex = Math.max(0, field.page - 1);
    if (pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const pageW = page.getWidth();
    const pageH = page.getHeight();

    const w = field.width * pageW;
    const h = field.height * pageH;
    const x = field.x * pageW;
    const y = pageH - field.y * pageH - h;

    if (field.imageRelativePath) {
      const imgBytes = await fs.readFile(absoluteStoragePath(field.imageRelativePath));
      const png = await pdf.embedPng(imgBytes);
      page.drawImage(png, { x, y, width: w, height: h });
      continue;
    }

    const text = (field.text || "").trim();
    if (!text) continue;

    let fontSize = Math.min(14, Math.max(8, h * 0.55));
    while (fontSize > 7 && font.widthOfTextAtSize(text, fontSize) > w - 4) {
      fontSize -= 0.5;
    }
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textX = x + Math.max(2, (w - textWidth) / 2);
    const textY = y + Math.max(2, (h - fontSize) / 2);

    page.drawText(text, {
      x: textX,
      y: textY,
      size: fontSize,
      font,
      color: rgb(0.07, 0.07, 0.07),
      maxWidth: w - 4,
    });
  }

  const out = await pdf.save();
  return Buffer.from(out);
}
