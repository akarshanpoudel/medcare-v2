import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookies } from "cookie";
import type { Request, Response } from "express";
import { ENV } from "./env";
import { COOKIE_NAME } from "../shared/const";

const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const PENDING_TOTP_TTL_SECONDS = 5 * 60; // 5 minutes to enter the code
const secretKey = new TextEncoder().encode(ENV.sessionSecret);

export interface SessionPayload {
  staffId: number;
  email: string;
  role: "admin";
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Creates a cryptographically SIGNED session token (HS256/JWT via `jose`).
 * Unlike the previous version, the cookie value is never a raw plaintext
 * identity string — it can't be forged by just guessing/copying an email
 * address, because it must carry a valid signature from ENV.sessionSecret.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload, purpose: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (
      payload.purpose === "session" &&
      typeof payload.staffId === "number" &&
      typeof payload.email === "string" &&
      payload.role === "admin"
    ) {
      return { staffId: payload.staffId, email: payload.email, role: "admin" };
    }
    return null;
  } catch {
    // Expired, malformed, or signed with a different secret — treat all of
    // these as "not logged in" rather than surfacing internals.
    return null;
  }
}

/**
 * Issued right after a correct password when TOTP is also required.
 * Deliberately a DIFFERENT token shape/purpose than the real session token
 * (see `purpose` below) so it can never be mistaken for — or reused as — an
 * actual logged-in session; it's only good for finishing the 2FA step, and
 * only for 5 minutes.
 */
export async function createPendingTotpToken(staffId: number): Promise<string> {
  return new SignJWT({ staffId, purpose: "totp-pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_TOTP_TTL_SECONDS}s`)
    .sign(secretKey);
}

export async function verifyPendingTotpToken(token: string): Promise<{ staffId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (payload.purpose === "totp-pending" && typeof payload.staffId === "number") {
      return { staffId: payload.staffId };
    }
    return null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: ENV.isProduction,
    // "lax" is appropriate here because this is a same-origin app (the API
    // and the client are served from the same host) — unlike the previous
    // "none", which weakened CSRF protection with no corresponding benefit.
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookies(header)[COOKIE_NAME];
}
