import {
  mysqlTable,
  int,
  varchar,
  text,
  mysqlEnum,
  timestamp,
  date,
  time,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Staff / admin accounts.
 * Passwords are ALWAYS stored hashed (bcrypt). Seed via `npm run db:seed`,
 * which reads ADMIN_EMAIL / ADMIN_PASSWORD from env once and hashes them —
 * the plaintext password is never persisted anywhere.
 */
export const staff = mysqlTable("staff", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull().default("Staff"),
  role: mysqlEnum("role", ["admin"]).notNull().default("admin"),

  // --- Account-level login protection (separate from the IP-based rate
  // limiter in server/index.ts — this one follows the ACCOUNT regardless
  // of which IP is attacking it) ---
  failedLoginAttempts: int("failed_login_attempts").notNull().default(0),
  // Set once failedLoginAttempts crosses the threshold; login is refused
  // while this is in the future. Auto-expires — never requires a manual
  // reset, so this can't be used to lock a real admin out indefinitely.
  lockedUntil: timestamp("locked_until"),

  // --- TOTP two-factor auth ---
  // Staged secret from an in-progress setup (or re-setup) — NOT yet used
  // for login. Kept separate from totpSecret so an abandoned or
  // in-progress re-setup can never disrupt an already-working 2FA config;
  // only confirmTotpSetup promotes this into totpSecret.
  totpPendingSecret: varchar("totp_pending_secret", { length: 64 }),
  totpSecret: varchar("totp_secret", { length: 64 }),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  // JSON array of {hash, usedAt} — bcrypt-hashed one-time recovery codes,
  // shown once at setup, for when the authenticator device is lost.
  totpBackupCodes: text("totp_backup_codes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex("staff_email_idx").on(table.email),
}));

/**
 * Patients are created (or reused) at booking time — no account/signup
 * required. Deduplicated by phone number, which is why phone is unique.
 */
export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  phoneIdx: uniqueIndex("patients_phone_idx").on(table.phone),
}));

export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  // Short, unguessable code shown to the patient at booking time. Used
  // together with their phone number to look up booking status later —
  // this replaces the old "log in to see your bookings" model entirely.
  reference: varchar("reference", { length: 12 }).notNull(),
  patientId: int("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  // Denormalized snapshot of the patient's details at booking time, so the
  // record stays meaningful even if the patient's info changes later.
  patientName: varchar("patient_name", { length: 255 }).notNull(),
  patientPhone: varchar("patient_phone", { length: 20 }).notNull(),
  patientEmail: varchar("patient_email", { length: 255 }),
  doctor: varchar("doctor", { length: 255 }).notNull(),
  department: varchar("department", { length: 255 }).notNull(),
  appointmentDate: date("appointment_date", { mode: "string" }).notNull(),
  appointmentTime: time("appointment_time").notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["pending", "confirmed", "rejected", "cancelled"])
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  referenceIdx: uniqueIndex("appointments_reference_idx").on(table.reference),
  // The core fix for double-booking: the same doctor cannot hold two
  // *active* (pending/confirmed) appointments in the same slot. Rejected
  // and cancelled rows are excluded at the application layer (see db.ts)
  // since MySQL doesn't support partial/filtered unique indexes — this
  // plain index backs the transactional row-lock check instead.
  slotIdx: index("appointments_slot_idx").on(table.doctor, table.appointmentDate, table.appointmentTime),
  patientIdx: index("appointments_patient_idx").on(table.patientId),
  statusIdx: index("appointments_status_idx").on(table.status),
  dateIdx: index("appointments_date_idx").on(table.appointmentDate),
}));

export const staffRelations = relations(staff, () => ({}));

export const patientsRelations = relations(patients, ({ many }) => ({
  appointments: many(appointments),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  patient: one(patients, {
    fields: [appointments.patientId],
    references: [patients.id],
  }),
}));

export type Staff = typeof staff.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
