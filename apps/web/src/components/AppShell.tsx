'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DEMO_USERS } from '../lib/demo-users';
import { useUser } from '../lib/user-context';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/requisitions', label: 'Requisitions' },
  { href: '/approvals', label: 'My Approvals' },
  { href: '/vendors', label: 'Vendors' },
  { href: '/purchase-orders', label: 'Purchase Orders' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/match-exceptions', label: 'Match Exceptions' },
  { href: '/payments', label: 'Payments' },
  { href: '/reports', label: 'Reports' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useUser();
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:block">
        <div className="mb-6 px-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Losung360</p>
          <p className="text-xs text-zinc-500">Procure-to-Pay</p>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-500 md:hidden">Losung360 P2P</p>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-zinc-500 sm:inline">Testing as</span>
            <select
              value={user.email}
              onChange={(e) => {
                const next = DEMO_USERS.find((u) => u.email === e.target.value);
                if (next) setUser(next);
              }}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {DEMO_USERS.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.label} — {u.role}
                </option>
              ))}
            </select>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
