import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, staffProcedure } from "../trpc";
import { loginSchema } from "../../shared/validation";
import {
  getStaffByEmail,
  getStaffById,
  isAccountLocked,
  recordFailedLogin,
  resetFailedLogins,
  beginTotpSetup,
  activateTotp,
  disableTotp as disableTotpInDb,
  updateBackupCodes,
} from "../db";
import {
  verifyPassword,
  hashPassword,
  createSessionToken,
  createPendingTotpToken,
  verifyPendingTotpToken,
  setSessionCookie,
  clearSessionCookie,
} from "../auth";
import {
  generateTotpSecret,
  getTotpQrCodeDataUrl,
  verifyTotpCode,
  generateBackupCodes,
  consumeBackupCode,
  type BackupCodeRecord,
} from "../totp";

// A real, validly-formatted bcrypt hash of a random, never-used password,
// computed once at startup. Used below so that an unknown email still pays
// the same bcrypt.compare() cost as a real one, instead of short-circuiting
// and leaking (via response timing) whether an email exists in the system.
const dummyHash = hashPassword(`no-such-user-${Date.now()}-${Math.random()}`);

function lockMessage(lockedUntil: Date): string {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function parseBackupCodes(raw: string | null): BackupCodeRecord[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as BackupCodeRecord[];
  } catch {
    return [];
  }
}

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.staff),

  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    const staffMember = await getStaffByEmail(input.email);

    // Locked accounts are rejected BEFORE the password check. That's what
    // stops a lockout window from being silently extended forever by an
    // attacker who just keeps trying during it — recordFailedLogin() below
    // is only ever reached for accounts that are NOT currently locked, so
    // it can never re-trigger while already locked. See AUDIT_FIXES.md for
    // the fuller reasoning on why this is auto-expiring rather than a hard
    // manual-reset lockout.
    if (staffMember && isAccountLocked(staffMember)) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: lockMessage(staffMember.lockedUntil!) });
    }

    // Always run a bcrypt compare, even when no account was found, using a
    // fixed dummy hash — keeps response timing consistent so it can't be
    // used to enumerate which emails have accounts.
    const hash = staffMember?.passwordHash ?? (await dummyHash);
    const passwordOk = await verifyPassword(input.password, hash);

    if (!staffMember || !passwordOk) {
      if (staffMember) await recordFailedLogin(staffMember.id);
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect email or password." });
    }

    if (staffMember.totpEnabled) {
      // Password was correct, but don't issue a real session yet — hand
      // back a short-lived, single-purpose token that only proves "the
      // password step passed" and expires in 5 minutes either way.
      const pendingToken = await createPendingTotpToken(staffMember.id);
      return { status: "totp_required" as const, pendingToken };
    }

    await resetFailedLogins(staffMember.id);
    const token = await createSessionToken({ staffId: staffMember.id, email: staffMember.email, role: "admin" });
    setSessionCookie(ctx.res, token);
    return {
      status: "success" as const,
      staff: {
        id: staffMember.id,
        email: staffMember.email,
        name: staffMember.name,
        role: staffMember.role as "admin",
      },
    };
  }),

  verifyTotp: publicProcedure
    .input(z.object({ pendingToken: z.string(), code: z.string().min(6).max(11) }))
    .mutation(async ({ ctx, input }) => {
      const pending = await verifyPendingTotpToken(input.pendingToken);
      if (!pending) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "That login attempt expired. Please sign in again." });
      }

      const staffMember = await getStaffById(pending.staffId);
      if (!staffMember || !staffMember.totpEnabled || !staffMember.totpSecret) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
      }

      if (isAccountLocked(staffMember)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: lockMessage(staffMember.lockedUntil!) });
      }

      let ok = verifyTotpCode(staffMember.email, staffMember.totpSecret, input.code);

      // Not a valid live TOTP code — try it as a one-time backup code
      // instead before giving up.
      if (!ok) {
        const backupCodes = parseBackupCodes(staffMember.totpBackupCodes);
        const updated = await consumeBackupCode(backupCodes, input.code);
        if (updated) {
          ok = true;
          await updateBackupCodes(staffMember.id, updated);
        }
      }

      if (!ok) {
        await recordFailedLogin(staffMember.id);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect code." });
      }

      await resetFailedLogins(staffMember.id);
      const token = await createSessionToken({ staffId: staffMember.id, email: staffMember.email, role: "admin" });
      setSessionCookie(ctx.res, token);
      return {
        id: staffMember.id,
        email: staffMember.email,
        name: staffMember.name,
        role: staffMember.role as "admin",
      };
    }),

  logout: staffProcedure.mutation(({ ctx }) => {
    clearSessionCookie(ctx.res);
    return { success: true };
  }),

  // --- 2FA management (requires an existing session) ---

  totpStatus: staffProcedure.query(async ({ ctx }) => {
    const staffMember = await getStaffById(ctx.staff.staffId);
    return { enabled: !!staffMember?.totpEnabled };
  }),

  setupTotp: staffProcedure.mutation(async ({ ctx }) => {
    // Staged in totpPendingSecret, NOT touching the currently-active
    // secret — an abandoned or re-run setup can never disrupt an
    // already-working 2FA configuration this way.
    const secret = generateTotpSecret();
    await beginTotpSetup(ctx.staff.staffId, secret);
    const qrCodeDataUrl = await getTotpQrCodeDataUrl(ctx.staff.email, secret);
    return { secret, qrCodeDataUrl };
  }),

  confirmTotpSetup: staffProcedure.input(z.object({ code: z.string().length(6) })).mutation(async ({ ctx, input }) => {
    const staffMember = await getStaffById(ctx.staff.staffId);
    if (!staffMember?.totpPendingSecret) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Start setup again — no pending 2FA setup found." });
    }
    const ok = verifyTotpCode(staffMember.email, staffMember.totpPendingSecret, input.code);
    if (!ok) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "That code didn't match. Check your authenticator app and try again.",
      });
    }
    const { plain, records } = await generateBackupCodes();
    await activateTotp(ctx.staff.staffId, staffMember.totpPendingSecret, records);
    return { backupCodes: plain };
  }),

  disableTotp: staffProcedure.input(z.object({ password: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const staffMember = await getStaffById(ctx.staff.staffId);
    if (!staffMember) throw new TRPCError({ code: "UNAUTHORIZED" });
    const ok = await verifyPassword(input.password, staffMember.passwordHash);
    if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password." });
    await disableTotpInDb(ctx.staff.staffId);
    return { success: true };
  }),

  regenerateBackupCodes: staffProcedure
    .input(z.object({ password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const staffMember = await getStaffById(ctx.staff.staffId);
      if (!staffMember?.totpEnabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "2FA isn't enabled." });
      }
      const ok = await verifyPassword(input.password, staffMember.passwordHash);
      if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password." });
      const { plain, records } = await generateBackupCodes();
      await updateBackupCodes(ctx.staff.staffId, records);
      return { backupCodes: plain };
    }),
});
