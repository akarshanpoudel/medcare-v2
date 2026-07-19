import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { Response } from "express";
import { TOTP, Secret } from "otpauth";

const hasDb = process.env.RUN_DB_TESTS === "1";

function mockResponse(): Response {
  const cookies: Record<string, string> = {};
  return {
    cookie: (name: string, value: string) => {
      cookies[name] = value;
    },
    clearCookie: (name: string) => {
      delete cookies[name];
    },
  } as unknown as Response;
}

describe.skipIf(!hasDb)("auth.login / auth.verifyTotp (integration)", () => {
  let db: Awaited<ReturnType<typeof import("../db").getDb>>;
  let staffTable: typeof import("../../drizzle/schema").staff;
  let authRouter: typeof import("./auth.router").authRouter;
  let closePool: typeof import("../db").closePool;
  let hashPassword: typeof import("../auth").hashPassword;

  const email = "totp-test-staff@medcareclinic.example";
  const password = "correct-horse-battery-staple-9000";
  let staffId: number;

  function caller() {
    return authRouter.createCaller({ req: {} as never, res: mockResponse(), staff: null });
  }

  beforeAll(async () => {
    const dbMod = await import("../db");
    const schemaMod = await import("../../drizzle/schema");
    const routerMod = await import("./auth.router");
    const authMod = await import("../auth");
    db = dbMod.getDb();
    staffTable = schemaMod.staff;
    authRouter = routerMod.authRouter;
    closePool = dbMod.closePool;
    hashPassword = authMod.hashPassword;

    await db.delete(staffTable).where(eq(staffTable.email, email));
    const passwordHash = await hashPassword(password);
    const [result] = await db.insert(staffTable).values({ email, passwordHash, name: "TOTP Test" });
    staffId = (result as unknown as { insertId: number }).insertId;
  });

  afterAll(async () => {
    await db.delete(staffTable).where(eq(staffTable.email, email));
    await closePool();
  });

  beforeEach(async () => {
    // Reset lockout/TOTP state between tests so they don't interfere.
    await db
      .update(staffTable)
      .set({ failedLoginAttempts: 0, lockedUntil: null, totpEnabled: false, totpSecret: null, totpPendingSecret: null, totpBackupCodes: null })
      .where(eq(staffTable.id, staffId));
  });

  it("logs in successfully with the correct password (no 2FA)", async () => {
    const result = await caller().login({ email, password });
    expect(result.status).toBe("success");
  });

  it("rejects an incorrect password without revealing which part was wrong", async () => {
    await expect(caller().login({ email, password: "wrong" })).rejects.toThrow("Incorrect email or password.");
  });

  it("locks the account after 5 failed attempts, and blocks even the correct password while locked", async () => {
    for (let i = 0; i < 5; i++) {
      await caller().login({ email, password: "wrong" }).catch(() => {});
    }
    const [row] = await db.select().from(staffTable).where(eq(staffTable.id, staffId)).limit(1);
    expect(row.failedLoginAttempts).toBe(5);
    expect(row.lockedUntil).not.toBeNull();

    // Even the CORRECT password is rejected while locked.
    await expect(caller().login({ email, password })).rejects.toThrow(/Too many failed attempts/);
  });

  it("does not extend the lockout further on additional attempts while already locked (regression)", async () => {
    for (let i = 0; i < 5; i++) {
      await caller().login({ email, password: "wrong" }).catch(() => {});
    }
    const [afterLock] = await db.select().from(staffTable).where(eq(staffTable.id, staffId)).limit(1);
    const firstLockedUntil = afterLock.lockedUntil!.getTime();

    // Keep hammering it — this is exactly the scenario that, before the
    // fix, kept pushing lockedUntil further into the future forever.
    for (let i = 0; i < 5; i++) {
      await caller().login({ email, password: "wrong" }).catch(() => {});
    }
    const [stillLocked] = await db.select().from(staffTable).where(eq(staffTable.id, staffId)).limit(1);
    expect(stillLocked.lockedUntil!.getTime()).toBe(firstLockedUntil);
    expect(stillLocked.failedLoginAttempts).toBe(5); // not still incrementing past the threshold either
  });

  it("resets the failure counter after a successful login", async () => {
    await caller().login({ email, password: "wrong" }).catch(() => {});
    await caller().login({ email, password: "wrong" }).catch(() => {});
    await caller().login({ email, password });
    const [row] = await db.select().from(staffTable).where(eq(staffTable.id, staffId)).limit(1);
    expect(row.failedLoginAttempts).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });

  it("requires TOTP when enabled, and does not issue a session from the password step alone", async () => {
    const secret = new Secret({ size: 20 }).base32;
    await db.update(staffTable).set({ totpSecret: secret, totpEnabled: true }).where(eq(staffTable.id, staffId));

    const result = await caller().login({ email, password });
    expect(result.status).toBe("totp_required");
    if (result.status !== "totp_required") throw new Error("unreachable");
    expect(typeof result.pendingToken).toBe("string");

    const code = new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate();
    const verified = await caller().verifyTotp({ pendingToken: result.pendingToken, code });
    expect(verified.email).toBe(email);
  });

  it("rejects a wrong TOTP code and counts it toward the same lockout", async () => {
    const secret = new Secret({ size: 20 }).base32;
    await db.update(staffTable).set({ totpSecret: secret, totpEnabled: true }).where(eq(staffTable.id, staffId));

    const result = await caller().login({ email, password });
    if (result.status !== "totp_required") throw new Error("expected totp_required");

    await expect(caller().verifyTotp({ pendingToken: result.pendingToken, code: "000000" })).rejects.toThrow(
      "Incorrect code."
    );
    const [row] = await db.select().from(staffTable).where(eq(staffTable.id, staffId)).limit(1);
    expect(row.failedLoginAttempts).toBe(1);
  });

  it("accepts a valid backup code in place of a TOTP code, and only once", async () => {
    const secret = new Secret({ size: 20 }).base32;
    const { generateBackupCodes } = await import("../totp");
    const { plain, records } = await generateBackupCodes();
    await db
      .update(staffTable)
      .set({ totpSecret: secret, totpEnabled: true, totpBackupCodes: JSON.stringify(records) })
      .where(eq(staffTable.id, staffId));

    const login1 = await caller().login({ email, password });
    if (login1.status !== "totp_required") throw new Error("expected totp_required");
    const verified = await caller().verifyTotp({ pendingToken: login1.pendingToken, code: plain[0] });
    expect(verified.email).toBe(email);

    // Same backup code again — must fail, it's single-use.
    const login2 = await caller().login({ email, password });
    if (login2.status !== "totp_required") throw new Error("expected totp_required");
    await expect(caller().verifyTotp({ pendingToken: login2.pendingToken, code: plain[0] })).rejects.toThrow(
      "Incorrect code."
    );
  });

  it("auto-expires — once lockedUntil is in the past, login works again without any manual reset", async () => {
    // Simulate "15 minutes have now passed" by directly setting a
    // past lockedUntil, rather than actually waiting 15 real minutes.
    await db
      .update(staffTable)
      .set({ failedLoginAttempts: 5, lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(staffTable.id, staffId));

    const result = await caller().login({ email, password });
    expect(result.status).toBe("success");
  });

  it("rejects a garbage/expired pending token instead of throwing an unhandled error", async () => {
    await expect(caller().verifyTotp({ pendingToken: "not-a-real-token", code: "123456" })).rejects.toThrow(
      /expired|sign in again/i
    );
  });
});
