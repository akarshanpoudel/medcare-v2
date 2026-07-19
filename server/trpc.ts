import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { verifySessionToken, readSessionCookie, type SessionPayload } from "./auth";
import { ENV } from "./env";

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const token = readSessionCookie(req);
  const staff: SessionPayload | null = token ? await verifySessionToken(token) : null;
  return { req, res, staff };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const zodError = error.cause instanceof ZodError ? error.cause.issues[0]?.message : null;
    return {
      ...shape,
      message: zodError ?? shape.message,
      // tRPC includes the raw stack trace in `data.stack` by default —
      // fine in development, but the same information-disclosure problem
      // the client-side ErrorBoundary had if it ever reached a real
      // client. Stripped in production; server-side logging (see
      // server/index.ts's onError) still captures the real error either way.
      data: ENV.isProduction ? { ...shape.data, stack: undefined } : shape.data,
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires a valid, signed staff session — see server/auth.ts. */
export const staffProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.staff) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to continue." });
  }
  return next({ ctx: { ...ctx, staff: ctx.staff } });
});
