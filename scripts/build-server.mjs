import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
  banner: {
    js: `import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);`,
  },
};

// Bundling all three entrypoints (not just the server) means `node
// dist/migrate.js` / `node dist/seed.js` work in the lean production image
// too, without needing tsx/typescript installed there.
await Promise.all([
  build({ ...shared, entryPoints: ["server/index.ts"], outfile: "dist/server.js" }),
  build({ ...shared, entryPoints: ["scripts/migrate.ts"], outfile: "dist/migrate.js" }),
  build({ ...shared, entryPoints: ["scripts/seed.ts"], outfile: "dist/seed.js" }),
]);
