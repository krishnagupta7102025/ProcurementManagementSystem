'use client';

import { use, useState } from 'react';
import { Card, ErrorBanner, Loading, PageHeader, Select } from '../../../components/ui';
import { StatusBadge } from '../../../components/StatusBadge';
import { apiFetch, ApiError } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import type { Vendor } from '../../../lib/types';

interface SpendSummary {
  totalCommittedMinorUnits: number;
  totalPaidMinorUnits: number;
  avgInvoiceToPaymentDays: number | null;
}

export default function VendorDetailPage(props: PageProps<'/vendors/[id]'>) {
  const { id } = use(props.params);
  const { data: vendor, error, loading, reload } = useApiData<Vendor>(`/vendors/${id}`);
  const spend = useApiData<SpendSummary>(`/vendors/${id}/spend-summary`);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  async function changeStatus(status: string) {
    setUpdating(true);
    setActionError(null);
    try {
      await apiFetch(`/vendors/${id}/status`, { method: 'PATCH', body: { status } });
      await reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!vendor) return null;

  return (
    <div className="max-w-3xl">
      <PageHeader title={vendor.legalName} subtitle="Vendor detail" />
      {actionError && <ErrorBanner message={actionError} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-medium text-stone-500">Status</p>
          <div className="mt-2">
            <StatusBadge status={vendor.status} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Select
              disabled={updating}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) changeStatus(e.target.value);
              }}
            >
              <option value="">Change status…</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="BLACKLISTED">Blacklisted</option>
            </Select>
          </div>
          <p className="mt-2 text-xs text-stone-500">Only Buyer/Admin can change vendor status.</p>
        </Card>

        <Card>
          <p className="text-sm font-medium text-stone-500">Details</p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500">GSTIN</dt>
              <dd>{vendor.gstin ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Payment terms</dt>
              <dd>Net {vendor.paymentTermsDays}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <p className="text-sm font-medium text-stone-500">Contacts</p>
          {vendor.contacts.length === 0 && <p className="mt-2 text-sm text-stone-500">No contacts on file.</p>}
          <ul className="mt-2 space-y-2 text-sm">
            {vendor.contacts.map((c) => (
              <li key={c.id}>
                <p className="font-medium text-stone-800 dark:text-stone-200">{c.name}</p>
                <p className="text-stone-500">{[c.email, c.phone].filter(Boolean).join(' · ')}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <p className="text-sm font-medium text-stone-500">Spend summary</p>
          {spend.loading && <p className="mt-2 text-sm text-stone-500">Loading…</p>}
          {spend.data && (
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">Total committed</dt>
                <dd>{formatMoney(spend.data.totalCommittedMinorUnits)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">Total paid</dt>
                <dd>{formatMoney(spend.data.totalPaidMinorUnits)}</dd>
              </div>
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}
