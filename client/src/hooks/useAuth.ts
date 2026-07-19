import { trpc } from "../lib/trpc";

/**
 * Staff auth state, derived purely from the `auth.me` query — no
 * localStorage caching of user info. The session itself lives in an
 * httpOnly cookie the browser already handles; there's nothing useful to
 * duplicate into client-readable storage, and doing so previously left
 * PII behind after logout.
 */
export function useAuth() {
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSettled: () => {
      utils.auth.me.setData(undefined, null);
      void utils.invalidate();
    },
  });

  return {
    staff: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    logout: () => logoutMutation.mutate(),
    isLoggingOut: logoutMutation.isPending,
  };
}
