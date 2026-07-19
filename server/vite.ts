import type { Express } from "express";
import type { Server } from "node:http";
import path from "node:path";
import { PROJECT_ROOT } from "./paths";

/** Dev only: mounts Vite as middleware so the client and API share one port with HMR. */
export async function setupViteDevMiddleware(app: Express, httpServer: Server): Promise<void> {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    // Explicit, rather than relying on Vite's auto-discovery: setting
    // `root: "client"` below changes where Vite searches for a config
    // file, which silently misses the real vite.config.ts at the project
    // root (and with it, the "@" / "@shared" path aliases) if not pointed
    // at directly.
    configFile: path.join(PROJECT_ROOT, "vite.config.ts"),
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: "custom",
    root: path.join(PROJECT_ROOT, "client"),
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;
      let html = await (await import("node:fs/promises")).readFile(
        path.join(PROJECT_ROOT, "client", "index.html"),
        "utf-8"
      );
      html = await vite.transformIndexHtml(url, html);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });
}
