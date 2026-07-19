import path from "node:path";
import { fileURLToPath } from "node:url";

// This file is bundled by esbuild into dist/server.js, and PROJECT_ROOT is
// computed from process.cwd() rather than import.meta.dirname. That's
// deliberate: esbuild inlines everything into one file, so
// import.meta.dirname would just point at dist/, and re-deriving "the repo
// root" from there is exactly the fragile relative-path math that broke
// static file serving last time. Instead we require the process to be
// started from the project root (true for `npm start`, and for the
// Docker/Railway configs shipped in this repo), and compute every other
// path from that one place.
export const PROJECT_ROOT = process.cwd();

// Must match vite.config.ts's `build.outDir`.
export const CLIENT_DIST_DIR = path.join(PROJECT_ROOT, "dist", "client");

export const SERVER_ENTRY = fileURLToPath(import.meta.url);
