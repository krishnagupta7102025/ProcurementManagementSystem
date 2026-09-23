'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { isLoginPath, useAuth } from '../lib/auth-context';
import {
  BanknoteIcon,
  BuildingIcon,
  CartIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClipboardIcon,
  HomeIcon,
  ReceiptIcon,
  SlidersIcon,
  WarningIcon,
} from './icons';

const NAV_ITEMS: { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; adminOnly?: boolean }[] = [
  { href: '/', label: 'Dashboard', icon: HomeIcon },
  { href: '/requisitions', label: 'Requisitions', icon: ClipboardIcon },
  { href: '/approvals', label: 'My Approvals', icon: CheckCircleIcon },
  { href: '/vendors', label: 'Vendors', icon: BuildingIcon },
  { href: '/purchase-orders', label: 'Purchase Orders', icon: CartIcon },
  { href: '/invoices', label: 'Invoices', icon: ReceiptIcon },
  { href: '/match-exceptions', label: 'Match Exceptions', icon: WarningIcon },
  { href: '/payments', label: 'Payments', icon: BanknoteIcon },
  { href: '/reports', label: 'Reports', icon: ChartBarIcon },
  // Departments and user creation are Admin-only on the backend
  // (CostCenterController, UserController) — hidden here to match, not to
  // enforce it; the API is what actually blocks non-admins.
  { href: '/settings', label: 'Settings', icon: SlidersIcon, adminOnly: true },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const pathname = usePathname();

  // The login page renders its own full-page layout with no sidebar/topbar
  // chrome. Everything else needs a real session — rendering `children`
  // without one would mount protected pages with user: null before the
  // AuthProvider's redirect effect has a chance to run, so this shows
  // nothing instead until either a session is ready or the redirect fires.
  if (isLoginPath(pathname)) {
    return <>{children}</>;
  }
  if (!ready || !user) {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-stone-200 bg-white px-3 py-5 dark:border-stone-800 dark:bg-stone-950 md:block">
        <Link href="/" className="mb-6 flex items-center gap-2 px-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">P2P</span>
          <span className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Losung<span className="text-orange-500">360</span>
          </span>
        </Link>
        <nav className="space-y-1">
          {NAV_ITEMS.filter((item) => !item.adminOnly || user.roles.includes('ADMIN')).map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
                    : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-orange-500' : 'text-stone-400'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3 dark:border-stone-800 dark:bg-stone-950">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600 dark:bg-stone-900 dark:text-stone-400">
              Procure-to-Pay
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white py-1 pl-1 pr-3 dark:border-stone-800 dark:bg-stone-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                {initials(user.displayName)}
              </span>
              <div className="leading-tight">
                <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{user.displayName}</div>
                <div className="text-[11px] text-stone-500">{user.roles.join(', ')}</div>
              </div>
            </div>
            <button
              onClick={logout}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
