import type { Request } from "express";

/**
 * Client IP after `trust proxy` is set (uses Express req.ip).
 * Never log this next to passwords or tokens.
 */
export function clientIp(req: Request): string | null {
  const ip = req.ip?.trim();
  if (ip) return ip;
  return req.socket.remoteAddress || null;
}
