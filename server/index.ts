import express from "express";
import http from "node:http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { ENV } from "./env";
import { appRouter } from "./routers";
import { createContext } from "./trpc";
import { closePool, getDb } from "./db";
import { staff } from "../drizzle/schema";

async function main() {
  const app = express();
  const httpServer = http.createServer(app);

  // Behind Railway/most PaaS load balancers, this is required for
  // `req.secure` / X-Forwarded-Proto to be trusted correctly (affects the
  // `secure` cookie flag and rate-limit IP detection).
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // A real CSP in production: Vite's dev client (HMR) relies on eval
      // and inline bootstrapping that a strict policy would block, and dev
      // only ever runs locally anyway, so it's simplest to only enforce
      // this where it matters and where the built output (external
      // script/style files, no eval) actually satisfies it.
      contentSecurityPolicy: ENV.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              // 'unsafe-inline' here only covers inline STYLE attributes
              // (used by a couple of UI primitives for CSS custom
              // properties) — much narrower risk than allowing it for
              // scriptSrc, which stays strict.
              styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
              fontSrc: ["'self'", "https://fonts.gstatic.com"],
              imgSrc: ["'self'", "data:"], // data: covers the TOTP QR code image
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'self'"],
            },
          }
        : false,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  // Plain, dependency-free health check — no required input, so platform
  // health probes (a bare GET) always get a 200.
  app.get("/api/health", (_req, res) => res.status(200).json({ ok: true }));

  // Rate limit every public endpoint that's either security-sensitive
  // (login, 2FA verification) or could be spammed/enumerated (booking,
  // the phone+reference lookup).
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
  const totpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
  const bookingLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
  const trackLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
  app.use("/api/trpc/auth.login", loginLimiter);
  app.use("/api/trpc/auth.verifyTotp", totpLimiter);
  app.use("/api/trpc/appointments.book", bookingLimiter);
  app.use("/api/trpc/appointments.track", trackLimiter);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path }) {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[trpc] ${path ?? "<unknown>"}:`, error);
        }
      },
    })
  );

  if (ENV.nodeEnv === "development") {
    const { setupViteDevMiddleware } = await import("./vite");
    await setupViteDevMiddleware(app, httpServer);
  } else {
    const { serveStaticClient } = await import("./static");
    serveStaticClient(app);
  }

  // Express's default error handler leaks stack traces to clients; this
  // one logs server-side and always returns a generic message.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[express] unhandled error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(ENV.port, resolve));
  console.log(`MedCare Clinic server listening on port ${ENV.port} (${ENV.nodeEnv})`);

  // Verify the DB is actually reachable at boot instead of discovering it
  // on the first request.
  try {
    await getDb().select().from(staff).limit(1);
  } catch (err) {
    console.error("Could not reach the database at startup:", err);
  }

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    httpServer.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
