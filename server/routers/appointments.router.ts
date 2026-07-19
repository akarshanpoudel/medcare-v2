import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, staffProcedure } from "../trpc";
import { bookingInputSchema, trackBookingSchema, doctorIdSchema } from "../../shared/validation";
import { DOCTORS } from "../../shared/const";
import {
  bookAppointment,
  getTakenSlots,
  getAppointmentsByPhoneAndReference,
  getAppointmentsForAdmin,
  updateAppointmentStatus,
  ConflictError,
  NotFoundError,
} from "../db";
import { notifyClinicOfNewBooking, sendBookingConfirmationToPatient, sendStatusUpdateToPatient } from "../notifications";

const doctorById = new Map(DOCTORS.map((d) => [d.id, d]));

export const appointmentsRouter = router({
  /** Public — anyone can book. This is the ONLY place appointments get created. */
  book: publicProcedure.input(bookingInputSchema).mutation(async ({ input }) => {
    const doctor = doctorById.get(input.doctorId);
    if (!doctor) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown doctor selected." });
    }

    let result;
    try {
      result = await bookAppointment({
        fullName: input.fullName,
        phone: input.phone,
        email: input.email || undefined,
        doctor: doctor.name,
        department: doctor.department,
        date: input.date,
        time: input.time,
        notes: input.notes || undefined,
      });
    } catch (err) {
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: "CONFLICT", message: err.message });
      }
      throw err;
    }

    // Fire-and-forget: notification/email failures are logged internally
    // and NEVER surface here — the appointment is already committed to the
    // database, so this response is always a success from this point on.
    void notifyClinicOfNewBooking(result.appointment);
    void sendBookingConfirmationToPatient(result.appointment);

    return { success: true as const, reference: result.reference, appointment: result.appointment };
  }),

  /** Public — real-time slot availability for a given doctor/date, replacing the old hardcoded UI. */
  availability: publicProcedure
    .input(z.object({ doctorId: doctorIdSchema, date: z.string() }))
    .query(async ({ input }) => {
      const doctor = doctorById.get(input.doctorId);
      if (!doctor) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown doctor." });
      const taken = await getTakenSlots(doctor.name, input.date);
      return { taken };
    }),

  /** Public — phone + reference code, scoped to that patient only. No account needed. */
  track: publicProcedure.input(trackBookingSchema).query(async ({ input }) => {
    const results = await getAppointmentsByPhoneAndReference(input.phone, input.reference.toUpperCase());
    if (results.length === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "We couldn't find a booking with that phone number and reference code.",
      });
    }
    return results;
  }),

  /** Staff-only, paginated + server-filtered — never loads the whole table. */
  list: staffProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        status: z.enum(["pending", "confirmed", "rejected", "cancelled"]).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
    )
    .query(({ input }) => getAppointmentsForAdmin(input)),

  confirm: staffProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const appt = await updateStatusOrThrow(input.id, "confirmed");
    void sendStatusUpdateToPatient(appt);
    return appt;
  }),

  reject: staffProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const appt = await updateStatusOrThrow(input.id, "rejected");
    void sendStatusUpdateToPatient(appt);
    return appt;
  }),

  cancel: staffProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    return updateStatusOrThrow(input.id, "cancelled");
  }),
});

async function updateStatusOrThrow(id: number, status: "confirmed" | "rejected" | "cancelled") {
  try {
    return await updateAppointmentStatus(id, status);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That appointment no longer exists." });
    }
    throw err;
  }
}
