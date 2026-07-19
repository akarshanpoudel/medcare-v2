import { describe, it, expect } from "vitest";
import { TOTP, Secret } from "otpauth";
import {
  generateTotpSecret,
  getTotpProvisioningUri,
  verifyTotpCode,
  generateBackupCodes,
  consumeBackupCode,
} from "./totp";

function codeFor(secret: string, atSeconds = Date.now() / 1000) {
  return new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate({
    timestamp: atSeconds * 1000,
  });
}

describe("TOTP secrets and codes", () => {
  it("generates a usable base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(10);
    expect(() => Secret.fromBase32(secret)).not.toThrow();
  });

  it("accepts the current valid code", () => {
    const secret = generateTotpSecret();
    const code = codeFor(secret);
    expect(verifyTotpCode("staff@clinic.example", secret, code)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode("staff@clinic.example", secret, "000000")).toBe(false);
  });

  it("rejects a code generated with a different secret", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const codeForB = codeFor(secretB);
    expect(verifyTotpCode("staff@clinic.example", secretA, codeForB)).toBe(false);
  });

  it("rejects non-6-digit input outright (e.g. a backup code shape)", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode("staff@clinic.example", secret, "ABCDE-FGHIJ")).toBe(false);
  });

  it("tolerates one step of clock drift but not more", () => {
    const secret = generateTotpSecret();
    const now = Date.now() / 1000;
    const oneStepAgo = codeFor(secret, now - 30);
    const threeStepsAgo = codeFor(secret, now - 90);
    expect(verifyTotpCode("staff@clinic.example", secret, oneStepAgo)).toBe(true);
    expect(verifyTotpCode("staff@clinic.example", secret, threeStepsAgo)).toBe(false);
  });

  it("produces a provisioning URI with the clinic issuer and the account email", () => {
    const secret = generateTotpSecret();
    const uri = getTotpProvisioningUri("staff@clinic.example", secret);
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(encodeURIComponent("MedCare Clinic"));
    expect(uri).toContain("staff%40clinic.example");
  });
});

describe("backup codes", () => {
  it("generates 8 unique codes and matching hashed records", async () => {
    const { plain, records } = await generateBackupCodes();
    expect(plain).toHaveLength(8);
    expect(new Set(plain).size).toBe(8);
    expect(records).toHaveLength(8);
    expect(records.every((r) => r.usedAt === null)).toBe(true);
  });

  it("consumes a valid unused code and marks it used", async () => {
    const { plain, records } = await generateBackupCodes();
    const updated = await consumeBackupCode(records, plain[0]);
    expect(updated).not.toBeNull();
    expect(updated![0].usedAt).not.toBeNull();
  });

  it("is case-insensitive", async () => {
    const { plain, records } = await generateBackupCodes();
    const updated = await consumeBackupCode(records, plain[0].toLowerCase());
    expect(updated).not.toBeNull();
  });

  it("rejects an already-used code (single use)", async () => {
    const { plain, records } = await generateBackupCodes();
    const afterFirstUse = await consumeBackupCode(records, plain[0]);
    const secondAttempt = await consumeBackupCode(afterFirstUse!, plain[0]);
    expect(secondAttempt).toBeNull();
  });

  it("rejects a code that was never issued", async () => {
    const { records } = await generateBackupCodes();
    const result = await consumeBackupCode(records, "ZZZZZ-ZZZZZ");
    expect(result).toBeNull();
  });
});
