import nodemailer, { type Transporter } from "nodemailer";
import { ENV } from "./env";
import { sendSms } from "./sms";
import type { Appointment } from "../drizzle/schema";
import { CLINIC_PHONE } from "../shared/const";

let _transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (_transporter !== undefined) return _transporter;
  if (!ENV.smtpHost || !ENV.smtpUser || !ENV.smtpPass) {
    _transporter = null;
    return null;
  }
  _transporter = nodemailer.createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort ?? 587,
    secure: ENV.smtpPort === 465,
    auth: { user: ENV.smtpUser, pass: ENV.smtpPass },
  });
  return _transporter;
}

/**
 * The core rule this whole module is built around: sending a notification
 * or email NEVER throws. If SMTP isn't configured, or the send fails, we
 * log it and move on — the appointment is already safely in the database
 * by the time this runs, and a notification failure must never surface to
 * the patient as a booking failure (that was the single most damaging bug
 * in the previous version).
 */
async function sendMailSafely(options: { to: string; subject: string; text: string }): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[email] SMTP not configured — logging instead of sending.\nTo: ${options.to}\nSubject: ${options.subject}\n${options.text}\n`
    );
    return false;
  }
  try {
    await transporter.sendMail({
      from: ENV.clinicFromEmail,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });
    return true;
  } catch (err) {
    console.error("[email] send failed, continuing without it:", err);
    return false;
  }
}

export async function notifyClinicOfNewBooking(appt: Appointment): Promise<void> {
  if (!ENV.notifyOwnerEmail) {
    console.warn(`[notify] NOTIFY_OWNER_EMAIL not set — new booking ${appt.reference} was not emailed to staff.`);
    return;
  }
  await sendMailSafely({
    to: ENV.notifyOwnerEmail,
    subject: `New booking: ${appt.patientName} — ${appt.appointmentDate} ${appt.appointmentTime}`,
    text: `${appt.patientName} (${appt.patientPhone}) booked ${appt.doctor} on ${appt.appointmentDate} at ${appt.appointmentTime}.\nReference: ${appt.reference}\nNotes: ${appt.notes ?? "—"}`,
  });
}

export async function sendBookingConfirmationToPatient(appt: Appointment): Promise<void> {
  const emailPromise = appt.patientEmail
    ? sendMailSafely({
        to: appt.patientEmail,
        subject: "Your MedCare Clinic appointment request",
        text: `Hi ${appt.patientName},\n\nWe've received your appointment request with ${appt.doctor} on ${appt.appointmentDate} at ${appt.appointmentTime}.\nYour reference code is ${appt.reference} — keep it to track your booking status.\n\nQuestions? Call us at ${CLINIC_PHONE}.\n\n— MedCare Clinic`,
      })
    : Promise.resolve(false);

  const smsPromise = sendSms(
    appt.patientPhone,
    `MedCare Clinic: Booking received with ${appt.doctor} on ${appt.appointmentDate} ${appt.appointmentTime.slice(0, 5)}. Ref: ${appt.reference}. Track it at your confirmation link or call ${CLINIC_PHONE}.`
  );

  await Promise.all([emailPromise, smsPromise]);
}

export async function sendStatusUpdateToPatient(appt: Appointment): Promise<void> {
  const verb = appt.status === "confirmed" ? "confirmed" : "unfortunately couldn't be confirmed";

  const emailPromise = appt.patientEmail
    ? sendMailSafely({
        to: appt.patientEmail,
        subject: `Your appointment (${appt.reference}) was ${appt.status}`,
        text: `Hi ${appt.patientName},\n\nYour appointment with ${appt.doctor} on ${appt.appointmentDate} at ${appt.appointmentTime} was ${verb}.\n\nQuestions? Call us at ${CLINIC_PHONE}.\n\n— MedCare Clinic`,
      })
    : Promise.resolve(false);

  const smsPromise = sendSms(
    appt.patientPhone,
    `MedCare Clinic: Your appointment (Ref: ${appt.reference}) with ${appt.doctor} on ${appt.appointmentDate} was ${appt.status}. Call ${CLINIC_PHONE} with questions.`
  );

  await Promise.all([emailPromise, smsPromise]);
}
