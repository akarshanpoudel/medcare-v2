import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { appointments, patients, staff, type Appointment } from "../drizzle/schema";
import { ENV } from "./env";

// Unambiguous alphabet (no 0/O/1/I) since this is read aloud / typed back
// in by patients.
const generateReference = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

export class ConflictError extends Error {}
export class NotFoundError extends Error {}

let _pool: mysql.Pool | null = null;

/**
 * A real connection POOL, not a single cached connection. mysql2's pool
 * transparently creates new connections as needed and discards dead ones,
 * so a transient DB restart or idle timeout doesn't permanently wedge the
 * app the way a single cached `createConnection()` did.
 */
function getPool(): mysql.Pool {
  if (!_pool) {
    _pool = mysql.createPool({
      uri: ENV.databaseUrl,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60_000,
      queueLimit: 0,
    });
  }
  return _pool;
}

export function getDb() {
  return drizzle(getPool(), {
    schema: { appointments, patients, staff },
    mode: "default",
  });
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function getStaffByEmail(email: string) {
  const db = getDb();
  const rows = await db.select().from(staff).where(eq(staff.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function getStaffById(id: number) {
  const db = getDb();
  const rows = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
  return rows[0] ?? null;
}

// Account-level login protection — separate from the IP-based rate limiter
// in server/index.ts. This one follows the ACCOUNT regardless of which IP
// is attacking it, but always auto-expires, so it can never be used to
// lock a real admin out indefinitely (see AUDIT_FIXES.md for the tradeoff
// this was chosen over a hard, manual-reset-only lockout).
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export function isAccountLocked(staffMember: { lockedUntil: Date | null }): boolean {
  return !!staffMember.lockedUntil && staffMember.lockedUntil.getTime() > Date.now();
}

/** Call after a failed password/TOTP check. Locks the account once the threshold is crossed. */
export async function recordFailedLogin(staffId: number): Promise<void> {
  const db = getDb();
  const current = await getStaffById(staffId);
  if (!current) return;
  const attempts = current.failedLoginAttempts + 1;
  const lockedUntil = attempts >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_DURATION_MS) : current.lockedUntil;
  await db.update(staff).set({ failedLoginAttempts: attempts, lockedUntil }).where(eq(staff.id, staffId));
}

/** Call after a fully successful login (password + TOTP if enabled). */
export async function resetFailedLogins(staffId: number): Promise<void> {
  const db = getDb();
  await db.update(staff).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(staff.id, staffId));
}

// --- TOTP ---

/** Stages a newly-generated secret WITHOUT touching the active one — see schema.ts comment on totpPendingSecret. */
export async function beginTotpSetup(staffId: number, pendingSecret: string): Promise<void> {
  const db = getDb();
  await db.update(staff).set({ totpPendingSecret: pendingSecret }).where(eq(staff.id, staffId));
}

/** Promotes the pending secret to active, enables 2FA, and stores the (hashed) backup codes. */
export async function activateTotp(
  staffId: number,
  confirmedSecret: string,
  backupCodes: { hash: string; usedAt: string | null }[]
): Promise<void> {
  const db = getDb();
  await db
    .update(staff)
    .set({
      totpSecret: confirmedSecret,
      totpPendingSecret: null,
      totpEnabled: true,
      totpBackupCodes: JSON.stringify(backupCodes),
    })
    .where(eq(staff.id, staffId));
}

export async function disableTotp(staffId: number): Promise<void> {
  const db = getDb();
  await db
    .update(staff)
    .set({ totpEnabled: false, totpSecret: null, totpPendingSecret: null, totpBackupCodes: null })
    .where(eq(staff.id, staffId));
}

export async function updateBackupCodes(staffId: number, backupCodes: { hash: string; usedAt: string | null }[]): Promise<void> {
  const db = getDb();
  await db.update(staff).set({ totpBackupCodes: JSON.stringify(backupCodes) }).where(eq(staff.id, staffId));
}

// ---------------------------------------------------------------------------
// Booking — the transactional, race-safe path
// ---------------------------------------------------------------------------

export interface BookAppointmentInput {
  fullName: string;
  phone: string;
  email?: string;
  doctor: string;
  department: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  notes?: string;
}

/**
 * Books an appointment atomically:
 *  1. Upserts the patient (race-safe via ON DUPLICATE KEY on patients.phone).
 *  2. Locks any existing active appointment in the same doctor/date/time
 *     slot with SELECT ... FOR UPDATE, inside a transaction.
 *  3. If one exists, rolls back and throws ConflictError.
 *  4. Otherwise inserts the new appointment and commits.
 *
 * Because the lookup in step 2 takes an InnoDB next-key lock on the
 * doctor+date+time index, a second concurrent booking attempt for the same
 * slot blocks until this transaction commits or rolls back, instead of
 * racing past the check the way a plain check-then-insert would.
 */
export async function bookAppointment(
  input: BookAppointmentInput
): Promise<{ appointment: Appointment; reference: string }> {
  const db = getDb();
  const reference = generateReference();

  return db.transaction(async (tx) => {
    await tx
      .insert(patients)
      .values({ fullName: input.fullName, phone: input.phone, email: input.email || null })
      .onDuplicateKeyUpdate({
        set: { fullName: input.fullName, email: input.email || null },
      });

    const [patient] = await tx.select().from(patients).where(eq(patients.phone, input.phone)).limit(1);
    if (!patient) throw new Error("Failed to upsert patient record");

    const conflict = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.doctor, input.doctor),
          eq(appointments.appointmentDate, input.date),
          eq(appointments.appointmentTime, input.time),
          sql`${appointments.status} IN ('pending','confirmed')`
        )
      )
      .for("update")
      .limit(1);

    if (conflict.length > 0) {
      throw new ConflictError("That slot was just taken. Please pick another time.");
    }

    const [result] = await tx.insert(appointments).values({
      reference,
      patientId: patient.id,
      patientName: input.fullName,
      patientPhone: input.phone,
      patientEmail: input.email || null,
      doctor: input.doctor,
      department: input.department,
      appointmentDate: input.date,
      appointmentTime: input.time,
      notes: input.notes || null,
      status: "pending",
    });

    const insertId = (result as unknown as { insertId: number }).insertId;
    const [appointment] = await tx.select().from(appointments).where(eq(appointments.id, insertId)).limit(1);
    if (!appointment) throw new Error("Failed to load appointment after insert");

    return { appointment, reference };
  });
}

/**
 * Returns which of today's slots for a doctor are already taken, so the
 * booking UI can show real availability instead of decorative fake data.
 */
export async function getTakenSlots(doctor: string, date: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ time: appointments.appointmentTime })
    .from(appointments)
    .where(
      and(
        eq(appointments.doctor, doctor),
        eq(appointments.appointmentDate, date),
        sql`${appointments.status} IN ('pending','confirmed')`
      )
    );
  return rows.map((r) => r.time.slice(0, 5));
}

// ---------------------------------------------------------------------------
// Patient-facing lookup (replaces "log in to see your bookings")
// ---------------------------------------------------------------------------

/**
 * Looks up a patient's full appointment history, but only after verifying
 * they know the phone number AND the reference code of at least one real
 * booking — the reference code is an 8-character unguessable secret only
 * ever shown to the patient at booking time, so knowing one proves
 * ownership without requiring an account.
 */
export async function getAppointmentsByPhoneAndReference(
  phone: string,
  reference: string
): Promise<Appointment[]> {
  const db = getDb();
  const [verify] = await db
    .select({ patientId: appointments.patientId })
    .from(appointments)
    .where(and(eq(appointments.patientPhone, phone), eq(appointments.reference, reference.toUpperCase())))
    .limit(1);

  if (!verify) return [];

  return db
    .select()
    .from(appointments)
    .where(eq(appointments.patientId, verify.patientId))
    .orderBy(desc(appointments.appointmentDate), desc(appointments.appointmentTime));
}

// ---------------------------------------------------------------------------
// Admin — paginated, server-filtered
// ---------------------------------------------------------------------------

export interface AdminAppointmentsQuery {
  page: number;
  pageSize: number;
  status?: "pending" | "confirmed" | "rejected" | "cancelled";
  dateFrom?: string;
  dateTo?: string;
}

export async function getAppointmentsForAdmin(query: AdminAppointmentsQuery) {
  const db = getDb();
  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(appointments.status, query.status));
  if (query.dateFrom) conditions.push(gte(appointments.appointmentDate, query.dateFrom));
  if (query.dateTo) conditions.push(lte(appointments.appointmentDate, query.dateTo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const pageSize = Math.min(Math.max(query.pageSize, 1), 100);
  const offset = (Math.max(query.page, 1) - 1) * pageSize;

  const [items, [{ count }]] = await Promise.all([
    db
      .select()
      .from(appointments)
      .where(where)
      .orderBy(desc(appointments.appointmentDate), desc(appointments.appointmentTime))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(appointments).where(where),
  ]);

  return { items, total: Number(count), page: query.page, pageSize };
}

export async function getAppointmentById(id: number): Promise<Appointment | null> {
  const db = getDb();
  const [row] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return row ?? null;
}

export async function updateAppointmentStatus(
  id: number,
  status: "confirmed" | "rejected" | "cancelled"
): Promise<Appointment> {
  const db = getDb();
  const existing = await getAppointmentById(id);
  if (!existing) {
    throw new NotFoundError(`Appointment ${id} does not exist`);
  }
  await db.update(appointments).set({ status }).where(eq(appointments.id, id));
  const updated = await getAppointmentById(id);
  if (!updated) throw new NotFoundError(`Appointment ${id} disappeared after update`);
  return updated;
}
