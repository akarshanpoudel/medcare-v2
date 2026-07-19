import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { CLIENT_DIST_DIR } from "./paths";

/**
 * Serves the built client. CLIENT_DIST_DIR is the SAME constant vite.config.ts
 * uses for `build.outDir` (see server/paths.ts) — there is exactly one place
 * that path is computed, so the server can no longer look in the wrong
 * directory the way the previous version did.
 */
export function serveStaticClient(app: Express): void {
  if (!fs.existsSync(CLIENT_DIST_DIR)) {
    throw new Error(
      `Client build not found at ${CLIENT_DIST_DIR}. Run "npm run build:client" before starting in production.`
    );
  }

  app.use(express.static(CLIENT_DIST_DIR, { index: false }));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(CLIENT_DIST_DIR, "index.html"));
  });
}
