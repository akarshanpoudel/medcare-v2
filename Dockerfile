# ---- deps: install once, reused by both build and runtime stages -------
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build: needs devDependencies (vite, esbuild, tailwind, tsc) -------
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# ---- runtime: lean image, production deps only --------------------------
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle/migrations ./drizzle/migrations

# Run these once against a fresh database (they're bundled, so no
# devDependencies are needed here):
#   docker run --env-file .env <image> node dist/migrate.js
#   docker run --env-file .env <image> node dist/seed.js
EXPOSE 3000
CMD ["node", "dist/server.js"]
