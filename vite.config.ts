import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "client"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    // Only used if you ever run `vite` standalone; normal dev goes through
    // `npm run dev`, which mounts Vite as middleware inside the Express
    // server (see server/vite.ts) so client + API share one origin/port.
    port: 5173,
  },
  build: {
    // Resolved to an ABSOLUTE path here on purpose. server/static.ts reads
    // this same computed path (via CLIENT_DIST_DIR in server/paths.ts)
    // instead of re-deriving it from import.meta.dirname at runtime, which
    // is what caused the client/server path mismatch in the previous build.
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true,
  },
});
