"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";

type Guard = () => boolean;

type ContextValue = {
  register: (g: Guard) => () => void;
  check: () => boolean;
};

const NavGuardContext = createContext<ContextValue | null>(null);

export function NavGuardProvider({ children }: { children: React.ReactNode }) {
  const guards = useRef<Set<Guard>>(new Set());

  const register = useCallback((g: Guard) => {
    guards.current.add(g);
    return () => {
      guards.current.delete(g);
    };
  }, []);

  const check = useCallback(() => {
    for (const g of guards.current) {
      if (!g()) return false;
    }
    return true;
  }, []);

  return (
    <NavGuardContext.Provider value={{ register, check }}>
      {children}
    </NavGuardContext.Provider>
  );
}

// Page-level hook: register a guard that runs before in-app navigation.
// Return `true` to allow nav, `false` to block. Confirm dialogs go inside the guard.
export function useNavGuard(guard: Guard) {
  const ctx = useContext(NavGuardContext);
  useEffect(() => {
    if (!ctx) return;
    return ctx.register(guard);
  }, [ctx, guard]);
}

// Hook for navigation-triggering components (e.g. the admin sidebar).
// Returns a function that returns `true` if navigation should proceed.
export function useNavGuardCheck(): () => boolean {
  const ctx = useContext(NavGuardContext);
  return ctx?.check ?? (() => true);
}
