import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../lib/api";
import type { SessionUser } from "../lib/types";

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  unauthenticated: boolean;
  backendDown: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<unknown>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [forcedOut, setForcedOut] = useState(false);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    retry: false,
    enabled: !forcedOut,
  });

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSettled: async () => {
      setForcedOut(true);
      queryClient.clear();
    },
  });

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync().catch(() => undefined);
  }, [logoutMutation]);

  const unauthenticated = me.isError && me.error instanceof ApiError && me.error.status === 401;
  const backendDown = me.isError && !(me.error instanceof ApiError && me.error.status === 401);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: forcedOut ? null : (me.data?.user ?? null),
      loading: !forcedOut && me.isPending,
      unauthenticated: forcedOut || unauthenticated,
      backendDown,
      logout,
      refetch: me.refetch,
    }),
    [backendDown, forcedOut, logout, me.data?.user, me.isPending, me.refetch, unauthenticated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
