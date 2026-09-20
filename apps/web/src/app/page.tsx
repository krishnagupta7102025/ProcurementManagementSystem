'use client';

import { Card, ErrorBanner, Loading, PageHeader } from '../components/ui';
import { formatMoney } from '../lib/format';
import { useApiData } from '../lib/use-api-data';
import { useUser } from '../lib/user-context';

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
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
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
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Signed in as ${user.label} (${user.role}) — switch users from the top-right at any time.`}
      />

      {realError && <ErrorBanner message={realError} />}
      {anyLoading && !realError && <Loading />}

      {forbidden && !anyLoading && (
        <Card className="mb-6">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Spend and aging reports are only visible to AP, Controller, and Admin users. Switch to{' '}
            <strong>Amy AP</strong> or <strong>Carl Controller</strong> to see them.
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
          <Stat
            label="AP outstanding (current)"
            value={formatMoney(aging.data?.current)}
            sub="Not yet due"
          />
          <Stat
            label="AP outstanding (90+ days)"
            value={formatMoney(aging.data?.days90Plus)}
            sub="Overdue — needs attention"
          />
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

      <Card className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Getting started</h2>
        <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Switch to <strong>Rita Requester</strong> and raise a new requisition.</li>
          <li>Switch to <strong>Alan Approver</strong> to approve it under &ldquo;My Approvals&rdquo;.</li>
          <li>Switch to <strong>Bella Buyer</strong> to turn it into a Purchase Order and issue it.</li>
          <li>Switch to <strong>Ravi Receiver</strong> to record the goods receipt.</li>
          <li>Switch to <strong>Amy AP</strong> to enter the vendor invoice, submit it, and release payment.</li>
        </ol>
      </Card>
    </div>
  );
}
