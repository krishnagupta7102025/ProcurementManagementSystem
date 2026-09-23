'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, setUnauthorizedHandler, TOKEN_STORAGE_KEY } from './api';

const USER_STORAGE_KEY = 'p2p-auth-user';

export interface SessionUser {
  id: string;
  orgId: string;
  email: string;
  displayName: string;
  roles: string[];
}

interface LoginResponse {
  token: string;
  user: SessionUser;
}

interface AuthContextValue {
  user: SessionUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function clearStoredSession() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
}

// next.config.ts sets trailingSlash: true (required for the GitHub Pages
// static export), so usePathname() returns "/login/" once routed there,
// not "/login" — a bare equality check against '/login' never matches,
// which caused an actual redirect loop (this component kept calling
// router.replace('/login') even while already on it).
export function isLoginPath(pathname: string): boolean {
  return pathname.replace(/\/$/, '') === '/login';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    const storedUser = window.localStorage.getItem(USER_STORAGE_KEY);
    if (token && storedUser) {
      try {
        // One-time hydration from localStorage on mount — there's no
        // external store to subscribe to, just a value to read once.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser(JSON.parse(storedUser));
      } catch {
        clearStoredSession();
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearStoredSession();
      setUser(null);
      router.replace('/login');
    });
    return () => setUnauthorizedHandler(null);
  }, [router]);

  useEffect(() => {
    if (ready && !user && !isLoginPath(pathname)) {
      router.replace('/login');
    }
  }, [ready, user, pathname, router]);

  async function login(email: string, password: string) {
    const result = await apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } });
    window.localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(result.user));
    setUser(result.user);
    router.replace('/');
  }

  function logout() {
    clearStoredSession();
    setUser(null);
    router.replace('/login');
  }

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * For pages under AppShell's protected area, which never mounts its
 * `children` until a session exists (see AppShell.tsx) — so `user` being
 * null here means that invariant broke, not a normal loading state.
 */
export function useRequiredUser(): SessionUser {
  const { user } = useAuth();
  if (!user) {
    throw new Error('useRequiredUser called with no active session — this should only render inside AppShell’s authenticated area');
  }
  return user;
}
