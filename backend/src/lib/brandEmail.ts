/**
 * Plain-text email clients + Proofpoint treat "DM.HR" as http://DM.HR
 * (.hr = Croatia TLD). Never send bare "DM.HR" in mail subject/body.
 */
export function sanitizeDmHrForEmail(text: string): string {
  if (!text || !text.includes("DM.HR")) return text;
  return text
    .replace(/DM\.HR Group/g, "DMHR Group")
    .replace(/DM\.HR Portal/g, "DMHR Portal")
    .replace(/DM\.HR portal/g, "DMHR portal")
    .replace(/DM\.HR Admin/g, "DMHR Admin")
    .replace(/DM\.HR adviser/g, "DMHR adviser")
    .replace(/DM\.HR client/g, "DMHR client")
    .replace(/DM\.HR/g, "DMHR");
}

/** True if text still contains auto-linkable brand spelling. */
export function containsDmHrBrand(text: string): boolean {
  return /DM\.HR/.test(text || "");
}

export const DM_HR_BRAND_EMAIL_HINT =
  'Do not use "DM.HR" in email copy — mail clients treat .hr as a website. Use "DMHR Group" instead.';
