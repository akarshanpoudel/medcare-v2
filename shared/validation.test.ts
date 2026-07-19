import { describe, it, expect } from "vitest";
import { bookingInputSchema, trackBookingSchema, loginSchema } from "./validation";

// Deliberately NOT using toISOString() here either — see client/src/lib/date.ts
// for why. shared/ shouldn't import from client/, so this is a small,
// intentional duplicate of the same local-date logic.
function todayLocalISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function validBooking(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fullName: "Hari Bahadur",
    phone: "9812345678",
    email: "hari@example.com",
    doctorId: "khatiwada",
    date: todayLocalISODate(),
    time: "09:00",
    notes: "",
    ...overrides,
  };
}

describe("bookingInputSchema", () => {
  it("accepts a well-formed booking", () => {
    expect(bookingInputSchema.safeParse(validBooking()).success).toBe(true);
  });

  it("rejects a date in the past", () => {
    const result = bookingInputSchema.safeParse(validBooking({ date: "2020-01-01" }));
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    const result = bookingInputSchema.safeParse(validBooking({ date: "01/01/2030" }));
    expect(result.success).toBe(false);
  });

  it("rejects a date that doesn't exist", () => {
    const result = bookingInputSchema.safeParse(validBooking({ date: "2026-02-30" }));
    expect(result.success).toBe(false);
  });

  it("accepts a real future date even when the process clock is set to a UTC+ timezone (regression: Nepal/UTC+5:45 previously made every date look invalid)", () => {
    const originalTZ = process.env.TZ;
    process.env.TZ = "Asia/Kathmandu";
    try {
      const result = bookingInputSchema.safeParse(validBooking({ date: "2030-07-15" }));
      expect(result.success).toBe(true);
    } finally {
      process.env.TZ = originalTZ;
    }
  });

  it("rejects a time outside clinic slots", () => {
    const result = bookingInputSchema.safeParse(validBooking({ time: "23:45" }));
    expect(result.success).toBe(false);
  });

  it("rejects an unknown doctor id", () => {
    const result = bookingInputSchema.safeParse(validBooking({ doctorId: "not-a-real-doctor" }));
    expect(result.success).toBe(false);
  });

  it("rejects a phone number that is too short", () => {
    const result = bookingInputSchema.safeParse(validBooking({ phone: "123" }));
    expect(result.success).toBe(false);
  });

  it("rejects a phone number with letters", () => {
    const result = bookingInputSchema.safeParse(validBooking({ phone: "98abc45678" }));
    expect(result.success).toBe(false);
  });

  it("allows email to be omitted", () => {
    const result = bookingInputSchema.safeParse(validBooking({ email: "" }));
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email when provided", () => {
    const result = bookingInputSchema.safeParse(validBooking({ email: "not-an-email" }));
    expect(result.success).toBe(false);
  });

  it("rejects a name that is too short", () => {
    const result = bookingInputSchema.safeParse(validBooking({ fullName: "A" }));
    expect(result.success).toBe(false);
  });
});

describe("trackBookingSchema", () => {
  it("accepts a valid phone + reference pair", () => {
    expect(trackBookingSchema.safeParse({ phone: "9812345678", reference: "7K3M9PXQ" }).success).toBe(true);
  });

  it("rejects a reference with symbols", () => {
    expect(trackBookingSchema.safeParse({ phone: "9812345678", reference: "7K3M-9!Q" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires a real email shape", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });

  it("requires a non-empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});
