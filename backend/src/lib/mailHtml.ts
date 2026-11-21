/** Escape text for safe HTML email bodies. */
export function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphHtml(block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return "";
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1a1a1a;">${escapeHtml(trimmed).replace(/\n/g, "<br/>")}</p>`;
}

/**
 * Build a simple HTML email from plain-text body.
 * Known absolute https URLs can be replaced with a CTA button instead of raw URL text.
 */
export function buildSimpleMailHtml(params: {
  subject: string;
  textBody: string;
  ctaUrl?: string | null;
  ctaLabel?: string;
}): string {
  const ctaUrl = (params.ctaUrl || "").trim();
  const ctaLabel = (params.ctaLabel || "Open link").trim();
  let body = params.textBody || "";

  if (ctaUrl && body.includes(ctaUrl)) {
    body = body.split(ctaUrl).join("").replace(/\n{3,}/g, "\n\n").trim();
  }

  const blocks = body
    .split(/\n{2,}/)
    .map((b) => paragraphHtml(b))
    .filter(Boolean)
    .join("\n");

  const button =
    ctaUrl && /^https?:\/\//i.test(ctaUrl)
      ? `<p style="margin:22px 0 8px;">
  <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 18px;background:#1e5080;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
    ${escapeHtml(ctaLabel)}
  </a>
</p>
<p style="margin:0 0 14px;font-size:12px;line-height:1.45;color:#667085;">
  If the button does not work, copy and paste this link into your browser:<br/>
  <a href="${escapeHtml(ctaUrl)}" style="color:#1e5080;word-break:break-all;">${escapeHtml(ctaUrl)}</a>
</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(params.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e7ec;border-radius:14px;padding:28px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr>
            <td>
              <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#667085;font-weight:650;">DMHR Group</p>
              ${blocks}
              ${button}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
