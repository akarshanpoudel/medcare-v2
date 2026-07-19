import { z } from "zod";
import { DOCTOR_IDS, generateDaySlots } from "./const";

const VALID_TIMES = new Set(generateDaySlots());

export const doctorIdSchema = z.enum(DOCTOR_IDS, { errorMap: () => ({ message: "Please choose a doctor" }) });

// YYYY-MM-DD, and must be a real calendar date (zod only checks the shape,
// so we also verify it round-trips through Date).
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((val) => {
    // Deliberately NOT appending a time (e.g. "T00:00:00") before parsing.
    // Per the JS spec, a bare "YYYY-MM-DD" string parses as UTC midnight,
    // while "YYYY-MM-DDT00:00:00" (no offset) parses as LOCAL midnight —
    // that mismatch, compared against a UTC round-trip below, made every
    // date look "invalid" for anyone east of UTC (e.g. Nepal, UTC+5:45).
    // Parsing as UTC on both sides keeps this check timezone-independent.
    const d = new Date(val);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === val;
  }, "That date doesn't exist")
  .refine((val) => {
    // Compare against *local* today, not UTC — see client/src/lib/date.ts
    // for the same logic used client-side.
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return val >= todayStr;
  }, "Appointment date can't be in the past");

const timeSchema = z.string().refine((val) => VALID_TIMES.has(val), {
  message: "Please choose a valid clinic time slot",
});

const phoneSchema = z
  .string()
  .trim()
  .min(7, "Phone number is too short")
  .max(20, "Phone number is too long")
  .regex(/^[0-9+\-\s()]+$/, "Phone number contains invalid characters");

export const bookingInputSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(255),
  phone: phoneSchema,
  email: z.string().trim().email("Please enter a valid email").max(255).optional().or(z.literal("")),
  doctorId: doctorIdSchema,
  date: dateSchema,
  time: timeSchema,
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type BookingInput = z.infer<typeof bookingInputSchema>;

export const trackBookingSchema = z.object({
  phone: phoneSchema,
  reference: z
    .string()
    .trim()
    .min(4)
    .max(12)
    .regex(/^[A-Z0-9-]+$/i, "Reference codes only contain letters and numbers"),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, "Password is required").max(200),
});
