import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";

// These exercise a real database (transactions, locking, unique
// constraints) rather than mocks, since that's exactly the class of bug
// (race conditions, connection handling) that mocks tend to hide. They only
// run when explicitly requested with a real database available:
//   RUN_DB_TESTS=1 DATABASE_URL=mysql://... npm test
// Otherwise (e.g. in CI without a database, or a plain local `npm test`)
// they're skipped rather than failing the whole suite.
const hasDb = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!hasDb)("bookAppointment (integration)", () => {
  let db: Awaited<ReturnType<typeof import("./db").getDb>>;
  let bookAppointment: typeof import("./db").bookAppointment;
  let closePool: typeof import("./db").closePool;
  let ConflictError: typeof import("./db").ConflictError;

  beforeAll(async () => {
    const mod = await import("./db");
    db = mod.getDb();
    bookAppointment = mod.bookAppointment;
    closePool = mod.closePool;
    ConflictError = mod.ConflictError;
    // Clean slate for these specific test doctors so re-runs are stable.
    await db.execute(sql`DELETE FROM appointments WHERE doctor LIKE 'Test Doctor%'`);
    await db.execute(sql`DELETE FROM patients WHERE phone LIKE '900000%'`);
  });

  afterAll(async () => {
    await closePool();
  });

  it("books an appointment and returns a reference code", async () => {
    const { appointment, reference } = await bookAppointment({
      fullName: "Test Patient A",
      phone: "9000001111",
      doctor: "Test Doctor Alpha",
      department: "General Medicine",
      date: "2030-01-15",
      time: "10:00",
    });
    expect(reference).toMatch(/^[A-Z0-9]{8}$/);
    expect(appointment.status).toBe("pending");
  });

  it("rejects a second booking for the same doctor/date/time slot", async () => {
    await bookAppointment({
      fullName: "Test Patient B",
      phone: "9000002222",
      doctor: "Test Doctor Beta",
      department: "General Medicine",
      date: "2030-01-16",
      time: "11:00",
    });

    await expect(
      bookAppointment({
        fullName: "Test Patient C",
        phone: "9000003333",
        doctor: "Test Doctor Beta",
        date: "2030-01-16",
        department: "General Medicine",
        time: "11:00",
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows the same patient (same phone) to book without creating duplicate patient rows", async () => {
    await bookAppointment({
      fullName: "Test Patient D",
      phone: "9000004444",
      doctor: "Test Doctor Gamma",
      department: "General Medicine",
      date: "2030-01-17",
      time: "09:00",
    });
    await bookAppointment({
      fullName: "Test Patient D",
      phone: "9000004444",
      doctor: "Test Doctor Gamma",
      department: "General Medicine",
      date: "2030-01-18",
      time: "09:00",
    });
    const [{ count }] = await db.execute(sql`SELECT COUNT(*) as count FROM patients WHERE phone = '9000004444'`).then(
      (r: any) => r[0]
    );
    expect(Number(count)).toBe(1);
  });

  it("under real concurrency, exactly one of two simultaneous bookings for the same slot wins", async () => {
    const attempt = () =>
      bookAppointment({
        fullName: "Race Condition Tester",
        phone: "9000005555",
        doctor: "Test Doctor Delta",
        department: "Cardiology",
        date: "2030-01-19",
        time: "14:00",
      }).then(
        () => "fulfilled" as const,
        () => "rejected" as const
      );

    // Fire both at the same time — this is the exact scenario the previous
    // check-then-insert implementation would fail under.
    const results = await Promise.all([attempt(), attempt()]);
    const fulfilledCount = results.filter((r) => r === "fulfilled").length;
    expect(fulfilledCount).toBe(1);
  });
});
