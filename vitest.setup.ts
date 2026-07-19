import "dotenv/config";

// Only fills in a value when one isn't already set, so exporting a real
// DATABASE_URL before `npm test` (to run the integration suite in
// server/db.test.ts against an actual database) still works as expected —
// this just keeps pure unit tests (auth, validation) from failing purely
// because .env hasn't been configured yet.
process.env.DATABASE_URL ??= "mysql://user:pass@localhost:3306/unit_tests_do_not_need_a_real_db";
process.env.SESSION_SECRET ??= "test-only-session-secret-0123456789abcdef";
