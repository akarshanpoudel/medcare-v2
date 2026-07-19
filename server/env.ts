import "dotenv/config";

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}. See .env.example.`);
  }
  return val;
}

const isProduction = process.env.NODE_ENV === "production";

const sessionSecret = process.env.SESSION_SECRET ?? "";
if (isProduction && sessionSecret.length < 32) {
  // Fail fast at boot rather than silently running with a guessable
  // session secret in production — this is exactly the class of mistake
  // (weak default JWT/session secret shipped to prod) the previous
  // version made.
  throw new Error(
    "SESSION_SECRET must be set to a random string of at least 32 characters in production."
  );
}

export const ENV = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: sessionSecret || "dev-only-insecure-secret-do-not-use-in-production",
  // Optional: if unset, notification/email sending degrades gracefully
  // (logs a warning) instead of throwing and breaking the booking flow.
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  notifyOwnerEmail: process.env.NOTIFY_OWNER_EMAIL,
  clinicFromEmail: process.env.CLINIC_FROM_EMAIL ?? "no-reply@medcareclinic.example",
  // Optional: if unset, SMS sending degrades gracefully (logs a warning)
  // the same way email does — see server/sms.ts.
  sparrowSmsToken: process.env.SPARROW_SMS_TOKEN,
  sparrowSmsSenderId: process.env.SPARROW_SMS_SENDER_ID,
};
