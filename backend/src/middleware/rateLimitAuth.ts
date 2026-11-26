import { createHash } from "crypto";
import type { Request } from "express";
import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import { env } from "../config/env";
import { clientIp } from "../lib/client-ip";

const WINDOW_MS = 15 * 60 * 1000;

function logRateLimitBlock(req: Request, kind: string) {
  console.info("[auth:rate-limit]", {
    event: "rate_limit_block",
    kind,
    path: req.path,
    ip: clientIp(req),
    at: new Date().toISOString(),
  });
}

const jsonTooMany: Options["handler"] = (req, res, _next, options) => {
  res.status(options.statusCode).json({
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many attempts. Try again in a few minutes.",
    },
  });
};

function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip || clientIp(req) || "unknown");
}

function makeIpLimiter(kind: string, max: number, prefix: string) {
  return rateLimit({
    windowMs: WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      logRateLimitBlock(req, kind);
      jsonTooMany(req, res, next, options);
    },
    keyGenerator: (req) => `${prefix}:${ipKey(req)}`,
  });
}

/** Login — per IP */
export const loginIpLimiter = makeIpLimiter(
  "login_ip",
  env.RATE_LIMIT_LOGIN_IP_MAX,
  "login:ip"
);

/**
 * Login — per email (after JSON body is available).
 * Skips if email missing so validation can respond normally.
 */
export const loginEmailLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: env.RATE_LIMIT_LOGIN_EMAIL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logRateLimitBlock(req, "login_email");
    jsonTooMany(req, res, next, options);
  },
  keyGenerator: (req) => {
    const raw = typeof req.body?.email === "string" ? req.body.email : "";
    const email = raw.trim().toLowerCase();
    if (!email.includes("@")) {
      return `login:email:invalid:${ipKey(req)}`;
    }
    return `login:email:${email}`;
  },
  skip: (req) => {
    const raw = typeof req.body?.email === "string" ? req.body.email : "";
    return !raw.trim().includes("@");
  },
});

/** Invite preview GET — per IP */
export const inviteGetIpLimiter = makeIpLimiter(
  "invite_get_ip",
  env.RATE_LIMIT_INVITE_IP_MAX,
  "invite:ip"
);

/** Set-password — per IP */
export const setPasswordIpLimiter = makeIpLimiter(
  "set_password_ip",
  env.RATE_LIMIT_SET_PASSWORD_IP_MAX,
  "setpw:ip"
);

/** Set-password — per token fingerprint (not full token) */
export const setPasswordTokenLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: env.RATE_LIMIT_SET_PASSWORD_TOKEN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logRateLimitBlock(req, "set_password_token");
    jsonTooMany(req, res, next, options);
  },
  keyGenerator: (req) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const tip = token
      ? createHash("sha256").update(token).digest("hex").slice(0, 16)
      : "missing";
    return `setpw:token:${tip}`;
  },
});

/** Change-password — per authenticated user (place after requireAuth) */
export const changePasswordLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: env.RATE_LIMIT_CHANGE_PASSWORD_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logRateLimitBlock(req, "change_password");
    jsonTooMany(req, res, next, options);
  },
  keyGenerator: (req) => {
    const id = req.auth?.id;
    if (id) return `changepw:user:${id}`;
    return `changepw:ip:${ipKey(req)}`;
  },
});

/** Refresh — per IP */
export const refreshIpLimiter = makeIpLimiter(
  "refresh_ip",
  env.RATE_LIMIT_REFRESH_IP_MAX,
  "refresh:ip"
);
