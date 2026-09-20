'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, Card, ErrorBanner, Field, Input, Loading, PageHeader, Select } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import { useUser } from '../../../lib/user-context';
import type { PurchaseOrder, Requisition, Vendor } from '../../../lib/types';

interface DraftLine {
  requisitionLineId: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  include: boolean;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { user } = useUser();
  const { data: vendors, loading: vendorsLoading } = useApiData<Vendor[]>('/vendors?activeOnly=true');
  const { data: requisitions, loading: requisitionsLoading } = useApiData<Requisition[]>('/requisitions?status=APPROVED');

  const [vendorId, setVendorId] = useState('');
  const [requisitionId, setRequisitionId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedRequisition = useMemo(
    () => requisitions?.find((r) => r.id === requisitionId) ?? null,
    [requisitions, requisitionId],
  );

  function selectRequisition(id: string) {
    setRequisitionId(id);
    const requisition = requisitions?.find((r) => r.id === id);
    setLines(
      requisition
        ? requisition.lines.map((line) => ({
            requisitionLineId: line.id,
            description: line.description,
            unit: line.unit,
            quantity: String(line.quantity),
            unitPrice: (line.estimatedUnitPriceMinorUnits / 100).toFixed(2),
            include: true,
          }))
        : [],
    );
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const includedLines = lines.filter((l) => l.include);
    if (!vendorId || includedLines.length === 0) {
      setError('Choose a vendor and at least one line to order.');
      return;
    }
    setSubmitting(true);
    try {
      const po = await apiFetch<PurchaseOrder>('/purchase-orders', {
        method: 'POST',
        userEmail: user.email,
        body: {
          vendorId,
          lines: includedLines.map((line) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unit: line.unit,
            unitPriceMinorUnits: Math.round(Number(line.unitPrice) * 100),
            allocations: [{ requisitionLineId: line.requisitionLineId, quantity: Number(line.quantity) }],
          })),
        },
      });
      router.push(`/purchase-orders/${po.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create purchase order');
      setSubmitting(false);
    }
  }

  const loading = vendorsLoading || requisitionsLoading;

  return (
    <div>
      <PageHeader title="New purchase order" subtitle="Pick an approved requisition and the vendor to send it to." />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Loading />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Card className="grid gap-4 sm:grid-cols-2">
            <Field label="Vendor">
              <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
                <option value="" disabled>
                  Select a vendor
                </option>
                {vendors?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.legalName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Approved requisition">
              <Select value={requisitionId} onChange={(e) => selectRequisition(e.target.value)} required>
                <option value="" disabled>
                  Select an approved requisition
                </option>
                {requisitions?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.department} — {formatMoney(r.estimatedTotalMinorUnits, r.currency)}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>

          {selectedRequisition && (
            <Card className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Lines to order</h2>
              {lines.map((line, index) => (
                <div key={line.requisitionLineId} className="grid items-end gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-12 dark:border-zinc-800">
                  <div className="flex items-center gap-2 sm:col-span-1">
                    <input
                      type="checkbox"
                      checked={line.include}
                      onChange={(e) => updateLine(index, { include: e.target.checked })}
                      className="h-4 w-4"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <Field label="Description">
                      <Input value={line.description} disabled />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Quantity">
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: e.target.value })}
                        disabled={!line.include}
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Unit">
                      <Input value={line.unit} disabled />
                    </Field>
                  </div>
                  <div className="sm:col-span-3">
                    <Field label="Negotiated unit price">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                        disabled={!line.include}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || !vendorId || !requisitionId}>
              {submitting ? 'Creating…' : 'Create purchase order'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
