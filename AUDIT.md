# Audit fixes — what changed and how it was verified

Every item below was tested against a real, running instance (MariaDB +
built server), not just re-read as code. Section numbers match the original
audit.

## 🔴 Critical

**1. Project didn't build.** Tailwind is now v3 end-to-end (CSS syntax
matches the installed package — no more v3/v4 mismatch), and the server no
longer compiles via raw `tsc`; it's bundled with esbuild
(`scripts/build-server.mjs`), which resolves relative imports itself and
sidesteps the NodeNext extension requirement entirely. One shared
`tsconfig.json` for the whole project instead of two configs that could
drift apart.
*Verified:* `npm run build` completes clean — client (Vite) and server
(esbuild) both succeed. `npm run typecheck` passes with zero errors across
client + server + shared.

**2. Admin login bypassable.** Replaced with bcrypt password hashing
(`server/auth.ts`) and signed JWT sessions (`jose`) — the cookie is a
verified signature, not a raw string comparison. The login page no longer
displays any credentials.
*Verified:* sending the exact old exploit —
`Cookie: mc_session=admin@medcareclinic.example` — against a protected
endpoint now returns `401 UNAUTHORIZED`. Logging in with the correct
password issues a real signed token; a byte-flipped copy of that same
token is rejected. See `server/auth.test.ts`.

**3. Patient dashboard read the admin-only endpoint.** There's no
"dashboard" anymore — patients look up bookings via `/track`, which takes
a phone number **and** the reference code shown at booking time, and
returns only that patient's appointments (`getAppointmentsByPhoneAndReference`
in `server/db.ts`). No account, no cross-patient data exposure.
*Verified:* looking up with a valid phone+reference pair returns exactly
one patient's appointments; an unrelated/incorrect pair returns `404`, not
someone else's data.

**4. Booking failed by default (notification threw after the DB write
succeeded).** `server/notifications.ts` never throws — no SMTP configured
means it logs a warning and returns; a real send failure is caught and
logged the same way. The booking response only ever depends on the
database write succeeding.
*Verified:* booked an appointment with `SMTP_HOST` unset — the API
returned `success: true` with a reference code, and the log shows
`[email] SMTP not configured — logging instead of sending` rather than an
error.

## 🟠 High

**5. No double-booking protection; fake availability UI.** `bookAppointment()`
takes a row lock (`SELECT ... FOR UPDATE`) on the target slot inside a
transaction before inserting, so a second concurrent request for the same
slot blocks and then fails with a clear "that slot was just taken" error
instead of silently double-booking. The booking form calls a real
`appointments.availability` query and disables already-taken times in the
UI — no more hardcoded slot data.
*Verified three ways:* (a) a direct unit test rejects a second booking for
an already-booked slot; (b) an integration test fires **two real concurrent
requests** at the same slot and asserts exactly one succeeds; (c) the same
scenario reproduced over live HTTP with `curl` — first request 200, second
409 `CONFLICT`.

**6. Duplicate fake mock booking endpoint.** Removed. There is exactly one
`appointments.book` procedure, and it's the real one.

**7. DB layer: no pooling/transactions/indexes/FK/pagination.**
`mysql.createPool()` replaces the single cached connection. Booking runs
inside a transaction. `drizzle/schema.ts` adds a foreign key
(`appointments.patientId → patients.id`), a unique index on
`patients.phone` (used for race-safe upsert via `ON DUPLICATE KEY UPDATE`),
a unique index on `appointments.reference`, and indexes on the
doctor/date/time slot, status, and date columns. `appointments.list` is
paginated and filtered server-side (`LIMIT`/`OFFSET` + `WHERE`), not loaded
in full and filtered in the browser.
*Verified:* migration applied cleanly to a real database (see the
generated SQL in `drizzle/migrations/0000_cold_orphan.sql`); the admin
panel's pagination and status filters hit the server with each change.

**8. Deployment config bugs.** The health check is now a plain
`GET /api/health` with no required input (`server/index.ts`), so a bare
platform probe gets a `200` — `railway.toml` points at it. Static file
serving now reads from one computed constant
(`server/paths.ts` → `CLIENT_DIST_DIR`) that Vite's own build config also
uses for its output directory, so they can't drift apart the way they did
before.
*Verified:* `curl /api/health` with no query string returns `200 {"ok":true}`;
the production server correctly serves the built `index.html` from the
directory Vite actually built into.

## 🟡 Medium

**9. Frontend bugs.** The scripted keyword-matching chatbot is gone,
replaced with a real `wa.me` WhatsApp link (opens WhatsApp, not a fake
in-page bot) and a "Track booking" link. Date validation uses local date
parts (`client/src/lib/date.ts`), not `toISOString()`, so the minimum
bookable date is correct for Nepal (UTC+5:45) in the evening. Google Fonts
are actually linked in `index.html` this time. All 4 doctors and all 4
service departments render (driven by the shared `DOCTORS` array, not
copy-pasted JSX). A real (placeholder-format, clearly documented) clinic
phone number replaces the literal `XXXXXX` that was previously shipped
into patient-facing emails.

**10. `useAuth` side effect + stale localStorage PII.** Rewritten as a
plain derived hook with no `localStorage` involvement at all — the session
lives only in the httpOnly cookie, so there's nothing to leak after logout.

**11. `ErrorBoundary` leaked stack traces.** Stack traces only render when
`import.meta.env.DEV` is true; `componentDidCatch` now actually logs the
error. The same class of leak existed server-side by default in tRPC's
error shape — fixed too (`server/trpc.ts` strips `data.stack` when
`NODE_ENV=production`), which was caught only by testing the built app's
real error responses, not by re-reading the original code.
*Verified:* a `NOT_FOUND` error against the production build returns
`"stack": null`; the same request against the dev server includes the
real stack.

**12. Weak validation.** `shared/validation.ts` is the single source of
truth for booking input, used by both the client (inline field errors)
and the server (authoritative). Dates must be real, well-formed, and not
in the past; times must match an actual clinic slot; phone numbers are
length- and format-checked against the column size.

**13. No pagination/sorting.** Covered in #7 — admin list is paginated and
ordered by date/time server-side; `/track` results are ordered
most-recent-first.

## 🟢 Low / cleanup

**14. Dead scaffolding.** Not carried over — no unused Map/chat/showcase
components, no unused "core" service modules, no orphaned debug scripts.
The rebuild only includes what's actually wired up and used.

**15. Testing gaps.** 26 tests: validation edge cases (past dates, bad
formats, unknown doctors), password hashing and session-token
tamper-resistance, and — the ones that matter most for this class of bug —
real-database tests for booking, patient de-duplication, and the
concurrent double-booking race. Run with `npm test`; add `RUN_DB_TESTS=1`
for the database suite.

**16. Misc.** Rate limiting added on `auth.login` (10 attempts / 15 min)
and `appointments.book` (20/hour) — verified by firing 13 rapid login
attempts and observing `401` for the first 10, `429` after.
`SESSION_SECRET` is required and length-checked at boot in production
(the app refuses to start with a weak/missing secret rather than silently
falling back to one). Cookies are `httpOnly`, `sameSite: lax`, and
`secure` in production. `helmet` adds standard security headers.

---

## Round 2 — account protection, 2FA, CSP, SMS (this update)

**Account-level login lockout.** Separate from the existing IP-based rate
limiter, `staff.failedLoginAttempts`/`lockedUntil` now track failures per
*account*, regardless of which IP is trying. After 5 failures the account
locks for 15 minutes — auto-expiring, never a hard/manual-reset lockout,
specifically because a hard lockout on a public login form lets anyone who
just knows the admin's email address lock the real admin out indefinitely
by deliberately failing 5 times. Locked accounts are rejected *before* the
password check, which is also what stops the lockout from being silently
re-extended forever by an attacker who keeps trying during the window —
`recordFailedLogin()` is structurally only ever reached for accounts that
aren't currently locked.
*Verified:* an integration test fires 5 wrong passwords, confirms the 6th
attempt is rejected even with the *correct* password, fires 5 more to
confirm `lockedUntil` does NOT move further into the future, then sets
`lockedUntil` into the past directly and confirms login succeeds again
with no manual intervention. Reproduced live over HTTP too — 5 failed
`curl` attempts against the real seeded admin, 6th (correct-password)
attempt returns "Too many failed attempts. Try again in 15 minutes."

**TOTP two-factor authentication**, added to the existing custom auth
rather than moving to a third-party provider (Auth0/Clerk were considered
— for a handful of staff accounts, adding an external auth dependency
wasn't worth it just to get the one feature — MFA — that's straightforward
to add directly). `server/totp.ts` handles secret generation, QR
provisioning, and code verification (`otpauth`); a *pending* secret is
staged separately from the active one during setup so an abandoned or
re-run setup can never disrupt an already-working 2FA configuration.
Login becomes two-step once enabled: `auth.login` returns a short-lived
(5 min), single-purpose pending token instead of a session when 2FA is
on; `auth.verifyTotp` exchanges a valid code (or a one-time backup code)
for the real session. Failed codes count toward the same account lockout
as failed passwords.
*Verified:* 12 unit tests (valid code accepted, wrong code / wrong secret
rejected, ±1 time-step drift tolerated, 3+ steps not, provisioning URI
shape) plus integration tests for the full login→pending-token→verify
chain, and reproduced live: set up 2FA against the real seeded admin
end-to-end over HTTP (scan-equivalent code generated locally via
`otpauth`, not hand-waved), logged out, logged back in, confirmed the
password step alone does NOT grant a session, then confirmed the TOTP
step does — and that the resulting cookie grants real access to an
admin-only endpoint, not just a 200 on the login call itself.

**Backup codes.** 8 single-use codes generated at 2FA setup (bcrypt-hashed
before storage, shown once), so losing the authenticator device doesn't
mean losing the account. Regeneration and disabling 2FA both require
re-entering the current password.
*Verified:* a code works once and is rejected on reuse; a never-issued
code is rejected; disabling 2FA with the wrong password is rejected (401)
and with the correct password succeeds.

**Real Content-Security-Policy in production** (previously disabled
entirely). `script-src 'self'` with no `unsafe-inline`/`unsafe-eval` —
confirmed safe by checking the actual built output only ever emits one
external `<script type="module" src="...">` tag, no inline scripts.
`style-src` allows `'unsafe-inline'` only (a couple of UI primitives set
CSS custom properties via the `style` attribute) plus Google Fonts;
`img-src` allows `data:` for the TOTP QR code. Disabled in development,
where Vite's HMR client needs eval/inline that a strict policy would
otherwise fight. *Verified:* checked the actual response header on the
built app, and re-ran the booking flow against the production build to
confirm nothing broke under it.

**Rate limiting extended** to `appointments.track` (20/15min — guards the
phone+reference lookup against brute-forcing reference codes) and
`auth.verifyTotp` (10/15min — a 6-digit code is only ~1M possibilities,
so the verification step needs its own limit independent of the login
endpoint's). *Verified* the same way as the original login limiter: fired
11 rapid requests at each, saw `401`/`429` split at the configured
threshold.

**SMS notifications via Sparrow SMS**, alongside the existing email path
and following the identical never-throw-on-failure pattern (`server/sms.ts`
mirrors `server/notifications.ts` exactly — unconfigured or failed sends
log a warning and return `false`, they never turn a successful booking
into an error response). Unlike email, phone is a required field on every
booking, so SMS is actually the more reliably-delivered channel here.
Sent on booking confirmation and on staff confirm/reject.

**DDoS — noted, not solved in code, on purpose.** Rate limiting above
covers application-layer abuse from a given client; it does not, and
cannot, stop a genuine volumetric/distributed attack — that's a network-
capacity problem that has to be solved in front of the app (e.g.
proxying the domain through Cloudflare), not inside it. Said so plainly
rather than implying app-level code closes this gap.

*What this round deliberately didn't change:* a hard/manual-reset
lockout and a move to a third-party auth provider were both considered
and set aside for reasons explained above — not overlooked.

