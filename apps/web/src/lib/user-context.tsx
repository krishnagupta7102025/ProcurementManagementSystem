'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEMO_USERS, type DemoUser } from './demo-users';

const STORAGE_KEY = 'p2p-demo-user-email';

interface UserContextValue {
  user: DemoUser;
  setUser: (user: DemoUser) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<DemoUser>(DEMO_USERS[0]);

  useEffect(() => {
    const savedEmail = window.localStorage.getItem(STORAGE_KEY);
    const found = DEMO_USERS.find((u) => u.email === savedEmail);
    // One-time hydration from localStorage on mount — there's no external
    // store to subscribe to, just a value to read once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (found) setUserState(found);
  }, []);

  const setUser = (next: DemoUser) => {
    setUserState(next);
    window.localStorage.setItem(STORAGE_KEY, next.email);
  };

  return <UserContext.Provider value={{ user, setUser }}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
