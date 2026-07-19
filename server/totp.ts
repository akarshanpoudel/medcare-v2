import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const ISSUER = "MedCare Clinic";
const BACKUP_CODE_COUNT = 8;

export interface BackupCodeRecord {
  hash: string;
  usedAt: string | null;
}

function buildTotp(email: string, secret: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

/** A fresh base32 secret — nothing is persisted until setup is confirmed. */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function getTotpProvisioningUri(email: string, secret: string): string {
  return buildTotp(email, secret).toString();
}

export async function getTotpQrCodeDataUrl(email: string, secret: string): Promise<string> {
  const uri = getTotpProvisioningUri(email, secret);
  return QRCode.toDataURL(uri, { margin: 1, width: 240 });
}

/**
 * Allows the code from one step before/after the current one (± ~30s) to
 * absorb ordinary clock drift between the server and the user's phone —
 * standard TOTP practice, and still only a 90-second total window.
 */
export function verifyTotpCode(email: string, secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const delta = buildTotp(email, secret).validate({ token: code, window: 1 });
  return delta !== null;
}

/** Plain codes are returned ONCE for display; only their bcrypt hashes are stored. */
export async function generateBackupCodes(): Promise<{ plain: string[]; records: BackupCodeRecord[] }> {
  const plain = Array.from({ length: BACKUP_CODE_COUNT }, () =>
    randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-")
  );
  const records = await Promise.all(
    plain.map(async (code) => ({ hash: await bcrypt.hash(code, 10), usedAt: null as string | null }))
  );
  return { plain, records };
}

/**
 * Checks `code` against the stored backup codes and, if it matches an
 * unused one, returns the updated record list with that code marked used
 * (backup codes are single-use). Returns null if no unused code matches.
 */
export async function consumeBackupCode(
  records: BackupCodeRecord[],
  code: string
): Promise<BackupCodeRecord[] | null> {
  const normalized = code.trim().toUpperCase();
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.usedAt) continue;
    if (await bcrypt.compare(normalized, record.hash)) {
      const updated = [...records];
      updated[i] = { ...record, usedAt: new Date().toISOString() };
      return updated;
    }
  }
  return null;
}
