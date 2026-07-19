import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { staff } from "../drizzle/schema";
import { hashPassword } from "../server/auth";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  if (!email || !password) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in your environment before seeding (only needed for this one-time run — " +
        "they are hashed and never stored in plaintext)."
    );
  }
  if (password.length < 10) {
    throw new Error("ADMIN_PASSWORD should be at least 10 characters.");
  }

  const connection = await mysql.createConnection(databaseUrl);
  const db = drizzle(connection);

  const existing = await db.select().from(staff).where(eq(staff.email, email.toLowerCase())).limit(1);
  const passwordHash = await hashPassword(password);

  if (existing[0]) {
    await db.update(staff).set({ passwordHash }).where(eq(staff.email, email.toLowerCase()));
    console.log(`Updated password for existing staff account: ${email}`);
  } else {
    await db.insert(staff).values({ email: email.toLowerCase(), passwordHash, name: "Clinic Admin", role: "admin" });
    console.log(`Created staff account: ${email}`);
  }

  await connection.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
