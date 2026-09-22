'use client';

import Link from 'next/link';
import { BanknoteIcon, CheckCircleIcon, ClipboardIcon } from '../components/icons';
import { Card, ErrorBanner, Loading } from '../components/ui';
import { formatMoney } from '../lib/format';
import { useApiData } from '../lib/use-api-data';
import { useRequiredUser } from '../lib/auth-context';
import type { PendingApprovalStep, Requisition } from '../lib/types';

interface OpenPoCommitment {
  totalMinorUnits: number;
  poCount: number;
  byVendor: { vendorId: string; vendorName: string; totalMinorUnits: number }[];
}
interface ApAging {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
}
interface CycleTime {
  invoiceCount: number;
  averageDays: number | null;
  medianDays: number | null;
}
interface SlaCompliance {
  totalSubmitted: number;
  escalatedCount: number;
  compliantCount: number;
  complianceRate: number | null;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-sm font-medium text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-50">{value}</p>
      {sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}
    </Card>
  );
}

const QUICK_LINKS = [
  { href: '/requisitions/new', label: 'New Requisition', icon: ClipboardIcon },
  { href: '/approvals', label: 'My Approvals', icon: CheckCircleIcon },
  { href: '/purchase-orders/new', label: 'New Purchase Order', icon: ClipboardIcon },
  { href: '/invoices/new', label: 'New Invoice', icon: BanknoteIcon },
];

export default function DashboardPage() {
  const user = useRequiredUser();
  const pendingApprovals = useApiData<PendingApprovalStep[]>('/approvals/pending');
  const myDrafts = useApiData<Requisition[]>('/requisitions?mine=true&status=DRAFT');
  const openPo = useApiData<OpenPoCommitment>('/reports/open-po-commitment');
  const aging = useApiData<ApAging>('/reports/ap-aging');
  const cycle = useApiData<CycleTime>('/reports/invoice-to-payment-cycle-time');
  const sla = useApiData<SlaCompliance>('/reports/requisition-sla-compliance');

  // Reports are restricted to AP/Controller/Admin — every other demo role
  // sees this page too (it's the default landing page), so a 403 here means
  // "not visible to this role", not a real error to block the page on.
  const forbidden = [openPo, aging, cycle, sla].some((r) => r.status === 403);
  const realError = !forbidden && (openPo.error || aging.error || cycle.error || sla.error);
  const anyLoading = openPo.loading || aging.loading || cycle.loading || sla.loading;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-orange-50 via-orange-50 to-white p-6 dark:from-orange-500/10 dark:via-orange-500/5 dark:to-transparent">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Welcome back, {user.displayName.split(' ')[0]}!</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Signed in as <strong>{user.displayName}</strong> ({user.roles.join(', ')})
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 rounded-xl border border-orange-200/70 bg-white px-3 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition-colors hover:border-orange-400 dark:border-orange-500/20 dark:bg-stone-900 dark:text-stone-100"
            >
              <link.icon className="h-4 w-4 shrink-0 text-orange-500" />
              <span className="truncate">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">Your action items</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-500/10">
              <CheckCircleIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm text-stone-500">Pending your approval</p>
              <p className="text-2xl font-bold text-stone-900 dark:text-stone-50">
                {pendingApprovals.loading ? '…' : (pendingApprovals.data?.length ?? 0)}
              </p>
            </div>
          </Card>
          <Card className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-500/10">
              <ClipboardIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm text-stone-500">Your draft requisitions</p>
              <p className="text-2xl font-bold text-stone-900 dark:text-stone-50">{myDrafts.loading ? '…' : (myDrafts.data?.length ?? 0)}</p>
            </div>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">Overview</h2>

        {realError && <ErrorBanner message={realError} />}
        {anyLoading && !realError && <Loading />}

        {forbidden && !anyLoading && (
          <Card>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Spend and aging reports are only visible to AP, Controller, and Admin users. Log in as one of those to see them.
            </p>
          </Card>
        )}

        {!anyLoading && !realError && !forbidden && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Open PO commitment"
              value={formatMoney(openPo.data?.totalMinorUnits)}
              sub={`${openPo.data?.poCount ?? 0} open purchase orders`}
            />
            <Stat label="AP outstanding (current)" value={formatMoney(aging.data?.current)} sub="Not yet due" />
            <Stat label="AP outstanding (90+ days)" value={formatMoney(aging.data?.days90Plus)} sub="Overdue — needs attention" />
            <Stat
              label="Invoice → payment cycle"
              value={cycle.data?.averageDays != null ? `${cycle.data.averageDays.toFixed(1)} days avg` : '—'}
              sub={`${cycle.data?.invoiceCount ?? 0} paid invoices`}
            />
            <Stat
              label="Requisition SLA compliance"
              value={sla.data?.complianceRate != null ? `${Math.round(sla.data.complianceRate * 100)}%` : '—'}
              sub={`${sla.data?.compliantCount ?? 0} of ${sla.data?.totalSubmitted ?? 0} submitted`}
            />
            <Stat label="AP outstanding (1–30 days)" value={formatMoney(aging.data?.days1To30)} />
            <Stat label="AP outstanding (31–60 days)" value={formatMoney(aging.data?.days31To60)} />
            <Stat label="AP outstanding (61–90 days)" value={formatMoney(aging.data?.days61To90)} />
          </div>
        )}
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-stone-900 dark:text-stone-50">Getting started</h2>
        <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
          Every seeded demo account shares the password <code>Passw0rd!</code> — log out and back in as each one to walk the full flow:
        </p>
        <ol className="list-inside list-decimal space-y-1 text-sm text-stone-600 dark:text-stone-400">
          <li>
            Log in as <strong>requester@demo.p2p</strong> (Rita Requester) and raise a new requisition.
          </li>
          <li>
            Log in as <strong>approver@demo.p2p</strong> (Alan Approver) to approve it under &ldquo;My Approvals&rdquo;.
          </li>
          <li>
            Log in as <strong>buyer@demo.p2p</strong> (Bella Buyer) to turn it into a Purchase Order and issue it.
          </li>
          <li>
            Log in as <strong>receiver@demo.p2p</strong> (Ravi Receiver) to record the goods receipt.
          </li>
          <li>
            Log in as <strong>ap@demo.p2p</strong> (Amy AP) to enter the vendor invoice, submit it, and release payment.
          </li>
        </ol>
      </Card>
    </div>
  );
}
