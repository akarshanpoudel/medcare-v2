# MedCare Clinic

A clinic appointment booking app — patients book online with real slot
availability and no account required; staff manage bookings from a
password-protected admin panel.

This is a ground-up rebuild of the original `medcare-clinic` project. Every
item from the prior audit has been fixed and **verified**, not just
rewritten — see [`AUDIT_FIXES.md`](./AUDIT_FIXES.md) for exactly what
changed and how each fix was tested against a real MySQL database and a
running server.

## Stack

- **Client:** React + Vite + TypeScript, Tailwind v3, shadcn-style UI primitives, wouter for routing, TanStack Query
- **Server:** Express + tRPC v11, bundled with esbuild (not raw `tsc`)
- **Database:** MySQL/MariaDB via Drizzle ORM, connection-pooled, migration-based
- **Auth:** bcrypt-hashed staff passwords, signed JWT sessions (`jose`), optional TOTP 2FA with backup codes — no accounts needed for patients
- **Notifications:** email (nodemailer, any SMTP provider) + SMS (Sparrow SMS) — both optional, booking never fails because of either

## Security

Covered in detail, with how each was verified, in **`AUDIT_FIXES.md`**. Short version:

- Account lockout after 5 failed logins, auto-expiring after 15 minutes (never a hard/manual-reset lockout — see the doc for why)
- Optional TOTP 2FA (`/staff/security` once signed in) with one-time backup codes
- Rate limiting on login, booking, TOTP verification, and the booking-lookup endpoint
- Real Content-Security-Policy in production
- SQL injection: not applicable — every query is parameterized through Drizzle
- XSS: no `dangerouslySetInnerHTML` anywhere; React's default escaping is the primary defense
- DDoS: rate limiting helps at the application layer, but a real volumetric attack needs a layer in front of the app (e.g. Cloudflare) — that's infrastructure, not something this codebase can solve on its own

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and SESSION_SECRET at minimum
npm run db:generate    # only needed if you change drizzle/schema.ts
npm run db:migrate     # creates tables
npm run db:seed        # creates the first staff login (reads ADMIN_EMAIL/ADMIN_PASSWORD from env, hashes once)
npm run dev             # http://localhost:3000 — client + API on one port
```

Generate a real `SESSION_SECRET` with:

```bash
openssl rand -base64 32
```

After your first login at `/staff/login`, visit `/staff/security` to turn on two-factor authentication — scan the QR code with any authenticator app (Google Authenticator, Authy, etc.) and save the backup codes it shows you once.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Client + API on one port, with HMR |
| `npm run build` | Builds the client (Vite) and server (esbuild) into `dist/` |
| `npm start` | Runs the production build (`NODE_ENV=production`) |
| `npm run typecheck` | `tsc --noEmit` across the whole project |
| `npm test` | Unit tests. Add `RUN_DB_TESTS=1` (with `DATABASE_URL` set) to also run the database integration suite in `server/db.test.ts` |
| `npm run db:generate` | Generates a SQL migration from `drizzle/schema.ts` |
| `npm run db:migrate` | Applies migrations |
| `npm run db:seed` | Creates/updates the staff login from `ADMIN_EMAIL` / `ADMIN_PASSWORD` |

## Deploying

**Docker:**
```bash
docker build -t medcare-clinic .
docker run --env-file .env -p 3000:3000 medcare-clinic node dist/migrate.js   # once
docker run --env-file .env -p 3000:3000 medcare-clinic node dist/seed.js     # once
docker run --env-file .env -p 3000:3000 medcare-clinic                        # the app
```
Or `docker compose up` for a local MySQL container + app together (set `MYSQL_ROOT_PASSWORD` and `SESSION_SECRET` in a `.env` file first — compose will refuse to start without them).

**Railway:** push this repo, set the env vars from `.env.example` in the Railway dashboard, and it builds from the included `Dockerfile`. The health check at `/api/health` needs no configuration.

## How booking actually stays conflict-free

Two people can hit "book" for the same doctor/date/time at the same instant.
`server/db.ts`'s `bookAppointment()` handles this inside a single database
transaction: it takes a row lock (`SELECT ... FOR UPDATE`) on any existing
active appointment for that exact slot before inserting. The second request
blocks until the first commits, then sees the now-existing row and is
rejected with a normal "that slot was just taken" error instead of creating
a duplicate. `server/db.test.ts` fires two real concurrent bookings at the
same slot and asserts exactly one wins — that test runs against an actual
database, not a mock, because this specific class of bug doesn't reliably
show up any other way.

## How patients check their booking without an account

Booking returns an 8-character reference code (shown once, and emailed if
the patient provided an address). `/track` looks up appointments by
phone + reference together — knowing one proves the visitor actually
received a real confirmation, without requiring sign-up or storing a
password for every patient who ever calls the clinic once.

## Project layout

```
client/src/         React app (pages, components, hooks)
server/              Express + tRPC API
  routers/           auth.router.ts, appointments.router.ts
  db.ts              All database access — pooling, transactions, the booking logic above
  auth.ts            Password hashing + session tokens
  notifications.ts   Email sending that can never break a booking (see AUDIT_FIXES.md)
shared/              Zod schemas + constants used by BOTH client and server
drizzle/             Schema + generated SQL migrations
scripts/             build-server.mjs (esbuild), migrate.ts, seed.ts
```
