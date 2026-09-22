'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, Card, ErrorBanner, Field, Input, Loading, PageHeader, Select } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import type { Invoice, PurchaseOrder, Vendor } from '../../../lib/types';

interface DraftLine {
  poLineId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  include: boolean;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const { data: vendors, loading: vendorsLoading } = useApiData<Vendor[]>('/vendors?activeOnly=true');
  const { data: purchaseOrders, loading: posLoading } = useApiData<PurchaseOrder[]>('/purchase-orders');

  const [vendorId, setVendorId] = useState('');
  const [poId, setPoId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [tax, setTax] = useState('0');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const posForVendor = useMemo(
    () => (purchaseOrders ?? []).filter((po) => po.vendorId === vendorId && po.status !== 'DRAFT' && po.status !== 'CANCELLED'),
    [purchaseOrders, vendorId],
  );

  function selectPo(id: string) {
    setPoId(id);
    const po = purchaseOrders?.find((p) => p.id === id);
    setLines(
      po
        ? po.lines.map((line) => ({
            poLineId: line.id,
            description: line.description,
            quantity: String(line.quantity),
            unitPrice: (line.unitPriceMinorUnits / 100).toFixed(2),
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
    if (!vendorId || !invoiceNumber || includedLines.length === 0) {
      setError('Fill in the vendor, invoice number, and at least one line.');
      return;
    }
    setSubmitting(true);
    try {
      const invoice = await apiFetch<Invoice>('/invoices', {
        method: 'POST',
        body: {
          vendorId,
          invoiceNumber,
          invoiceDate: new Date(invoiceDate).toISOString(),
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          taxMinorUnits: Math.round(Number(tax) * 100),
          lines: includedLines.map((line) => ({
            poLineId: line.poLineId,
            description: line.description,
            quantity: Number(line.quantity),
            unitPriceMinorUnits: Math.round(Number(line.unitPrice) * 100),
          })),
        },
      });
      router.push(`/invoices/detail?id=${invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice');
      setSubmitting(false);
    }
  }

  const loading = vendorsLoading || posLoading;

  return (
    <div>
      <PageHeader title="New invoice" subtitle="Record a vendor invoice against an issued purchase order." />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Loading />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Card className="grid gap-4 sm:grid-cols-2">
            <Field label="Vendor">
              <Select
                value={vendorId}
                onChange={(e) => {
                  setVendorId(e.target.value);
                  setPoId('');
                  setLines([]);
                }}
                required
              >
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
            <Field label="Purchase order">
              <Select value={poId} onChange={(e) => selectPo(e.target.value)} required disabled={!vendorId}>
                <option value="" disabled>
                  {vendorId ? 'Select a purchase order' : 'Choose a vendor first'}
                </option>
                {posForVendor.map((po) => (
                  <option key={po.id} value={po.id}>
                    {formatMoney(po.negotiatedTotalMinorUnits, po.currency)} — {po.status}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Invoice number">
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
            </Field>
            <Field label="Invoice date">
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
            </Field>
            <Field label="Due date" hint="Optional">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Tax amount">
              <Input type="number" min={0} step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
            </Field>
          </Card>

          {lines.length > 0 && (
            <Card className="space-y-3">
              <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Lines to invoice</h2>
              {lines.map((line, index) => (
                <div key={line.poLineId} className="grid items-end gap-3 rounded-lg border border-stone-200 p-3 sm:grid-cols-12 dark:border-stone-800">
                  <div className="flex items-center gap-2 sm:col-span-1">
                    <input
                      type="checkbox"
                      checked={line.include}
                      onChange={(e) => updateLine(index, { include: e.target.checked })}
                      className="h-4 w-4"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <Field label="Description">
                      <Input value={line.description} disabled />
                    </Field>
                  </div>
                  <div className="sm:col-span-3">
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
                  <div className="sm:col-span-3">
                    <Field label="Unit price">
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
            <Button type="submit" disabled={submitting || !vendorId || !poId}>
              {submitting ? 'Creating…' : 'Create invoice'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
