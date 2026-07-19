import { router } from "../trpc";
import { authRouter } from "./auth.router";
import { appointmentsRouter } from "./appointments.router";

export const appRouter = router({
  auth: authRouter,
  appointments: appointmentsRouter,
});

export type AppRouter = typeof appRouter;
