import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { clientIp } from "../lib/client-ip";

const inFlightByIp = new Map<string, number>();

/** Limit parallel multipart uploads per client IP (#7). */
export function uploadConcurrencyLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = clientIp(req) || "unknown";
  const current = inFlightByIp.get(ip) || 0;
  if (current >= env.UPLOAD_MAX_CONCURRENT_IP) {
    return res.status(429).json({
      success: false,
      error: {
        code: "UPLOAD_BUSY",
        message: "Too many uploads in progress. Try again in a moment.",
      },
    });
  }

  inFlightByIp.set(ip, current + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const nextCount = (inFlightByIp.get(ip) || 1) - 1;
    if (nextCount <= 0) inFlightByIp.delete(ip);
    else inFlightByIp.set(ip, nextCount);
  };

  res.on("finish", release);
  res.on("close", release);
  next();
}
