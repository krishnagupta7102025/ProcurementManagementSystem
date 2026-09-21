'use client';

import Link from 'next/link';
import { BuildingIcon, CheckCircleIcon, ClipboardIcon } from '../../components/icons';
import { Card, EmptyState, PageHeader } from '../../components/ui';
import { useUser } from '../../lib/user-context';

export default function SettingsPage() {
  const { user } = useUser();

  if (user.role !== 'ADMIN') {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Org-level configuration." />
        <EmptyState>Settings are only available to Admin users. Switch to Ada Admin to manage departments, users, and approval rules.</EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure departments, users, and approval routing for your organization." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/settings/departments">
          <Card className="flex items-start gap-4 transition-colors hover:border-orange-300">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 dark:bg-orange-500/10">
              <ClipboardIcon className="h-6 w-6" />
            </span>
            <div>
              <h2 className="font-semibold text-stone-900 dark:text-stone-50">Departments</h2>
              <p className="mt-1 text-sm text-stone-500">Create and manage the cost centers requisitions are raised against.</p>
            </div>
          </Card>
        </Link>
        <Link href="/settings/users">
          <Card className="flex items-start gap-4 transition-colors hover:border-orange-300">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 dark:bg-orange-500/10">
              <BuildingIcon className="h-6 w-6" />
            </span>
            <div>
              <h2 className="font-semibold text-stone-900 dark:text-stone-50">Users</h2>
              <p className="mt-1 text-sm text-stone-500">Provision users and assign the roles they need before they first sign in.</p>
            </div>
          </Card>
        </Link>
        <Link href="/settings/approval-rules">
          <Card className="flex items-start gap-4 transition-colors hover:border-orange-300">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 dark:bg-orange-500/10">
              <CheckCircleIcon className="h-6 w-6" />
            </span>
            <div>
              <h2 className="font-semibold text-stone-900 dark:text-stone-50">Approval rules</h2>
              <p className="mt-1 text-sm text-stone-500">Configure which approvers a requisition routes to, by department, cost center, and amount.</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
