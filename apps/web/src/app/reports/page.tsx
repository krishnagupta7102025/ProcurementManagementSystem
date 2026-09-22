'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, Loading, PageHeader, Table, Td, Th, TRow } from '../../components/ui';
import { apiFetchBlob } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useApiData } from '../../lib/use-api-data';
import { useRequiredUser } from '../../lib/auth-context';

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

export default function ReportsPage() {
  const user = useRequiredUser();
  const openPo = useApiData<OpenPoCommitment>('/reports/open-po-commitment');
  const aging = useApiData<ApAging>('/reports/ap-aging');
  const cycle = useApiData<CycleTime>('/reports/invoice-to-payment-cycle-time');
  const sla = useApiData<SlaCompliance>('/reports/requisition-sla-compliance');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const forbidden = [openPo, aging, cycle, sla].some((r) => r.status === 403);
  const realError = !forbidden && (openPo.error || aging.error || cycle.error || sla.error);
  const anyLoading = openPo.loading || aging.loading || cycle.loading || sla.loading;

  // GL export is AP/Admin only — stricter than the read-only reports above,
  // which Controller can also see — so the button is hidden rather than
  // left to fail with a 403 on click.
  const canExportGl = user.roles.includes('AP') || user.roles.includes('ADMIN');

  async function downloadGlExport() {
    setExportError(null);
    setExporting(true);
    try {
      const blob = await apiFetchBlob('/reports/gl-export');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gl-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to download GL export');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Spend, aging, and cycle-time metrics across the org."
        action={
          canExportGl && (
            <Button variant="secondary" onClick={downloadGlExport} disabled={exporting}>
              {exporting ? 'Preparing…' : 'Download GL export (CSV)'}
            </Button>
          )
        }
      />

      {exportError && <ErrorBanner message={exportError} />}
      {realError && <ErrorBanner message={realError} />}
      {forbidden && !anyLoading && (
        <EmptyState>Reports are only visible to AP, Controller, and Admin users. Switch users from the top-right.</EmptyState>
      )}
      {anyLoading && !realError && <Loading />}

      {!anyLoading && !realError && !forbidden && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Open PO commitment" value={formatMoney(openPo.data?.totalMinorUnits)} sub={`${openPo.data?.poCount ?? 0} open POs`} />
            <Stat
              label="Invoice → payment cycle"
              value={cycle.data?.averageDays != null ? `${cycle.data.averageDays.toFixed(1)} days avg` : '—'}
              sub={cycle.data?.medianDays != null ? `${cycle.data.medianDays.toFixed(1)} days median` : undefined}
            />
            <Stat
              label="Requisition SLA compliance"
              value={sla.data?.complianceRate != null ? `${Math.round(sla.data.complianceRate * 100)}%` : '—'}
              sub={`${sla.data?.compliantCount ?? 0} of ${sla.data?.totalSubmitted ?? 0} submitted`}
            />
            <Stat label="AP outstanding (90+ days)" value={formatMoney(aging.data?.days90Plus)} sub="Overdue — needs attention" />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">AP aging</h2>
            <Table>
              <thead>
                <tr>
                  <Th>Current</Th>
                  <Th>1–30 days</Th>
                  <Th>31–60 days</Th>
                  <Th>61–90 days</Th>
                  <Th>90+ days</Th>
                </tr>
              </thead>
              <tbody>
                <TRow>
                  <Td>{formatMoney(aging.data?.current)}</Td>
                  <Td>{formatMoney(aging.data?.days1To30)}</Td>
                  <Td>{formatMoney(aging.data?.days31To60)}</Td>
                  <Td>{formatMoney(aging.data?.days61To90)}</Td>
                  <Td>{formatMoney(aging.data?.days90Plus)}</Td>
                </TRow>
              </tbody>
            </Table>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">Open commitment by vendor</h2>
            {openPo.data && openPo.data.byVendor.length > 0 ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Vendor</Th>
                    <Th>Open commitment</Th>
                  </tr>
                </thead>
                <tbody>
                  {openPo.data.byVendor.map((v) => (
                    <TRow key={v.vendorId}>
                      <Td>{v.vendorName}</Td>
                      <Td>{formatMoney(v.totalMinorUnits)}</Td>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState>No open purchase orders.</EmptyState>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
