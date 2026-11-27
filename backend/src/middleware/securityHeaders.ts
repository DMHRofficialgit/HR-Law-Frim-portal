import type { NextFunction, Request, Response } from "express";

/**
 * Baseline browser hardening for API responses.
 * Full page CSP lives on the Next frontend (#8); API stays JSON-friendly.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );
  next();
}
