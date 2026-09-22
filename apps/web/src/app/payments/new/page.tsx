'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, Loading, PageHeader, Table, Td, Th, TRow } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import type { Invoice, PaymentBatch } from '../../../lib/types';

export default function NewPaymentBatchPage() {
  const router = useRouter();
  const { data: invoices, error, loading } = useApiData<Invoice[]>('/payment-batches/candidate-invoices');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (selected.size === 0) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const chosen = (invoices ?? []).filter((inv) => selected.has(inv.id));
      const batch = await apiFetch<PaymentBatch>('/payment-batches', {
        method: 'POST',
        body: {
          lines: chosen.map((inv) => ({
            invoiceId: inv.id,
            amountMinorUnits: inv.totalMinorUnits - inv.paidAmountMinorUnits,
          })),
        },
      });
      router.push(`/payments/detail?id=${batch.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create payment batch');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="New payment batch" subtitle="Select approved invoices to pay together." />

      {error && <ErrorBanner message={error} />}
      {submitError && <ErrorBanner message={submitError} />}
      {loading && <Loading />}

      {!loading && !error && invoices && invoices.length === 0 && <EmptyState>No invoices are approved for payment right now.</EmptyState>}

      {!loading && !error && invoices && invoices.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>{' '}</Th>
                <Th>Vendor</Th>
                <Th>Invoice #</Th>
                <Th>Amount due</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <TRow key={inv.id}>
                  <Td>
                    <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggle(inv.id)} className="h-4 w-4" />
                  </Td>
                  <Td>{inv.vendor?.legalName ?? inv.vendorId}</Td>
                  <Td>{inv.invoiceNumber}</Td>
                  <Td>{formatMoney(inv.totalMinorUnits - inv.paidAmountMinorUnits, inv.currency)}</Td>
                </TRow>
              ))}
            </tbody>
          </Table>

          <Card className="mt-4 flex items-center justify-between">
            <span className="text-sm text-stone-600 dark:text-stone-400">{selected.size} invoice(s) selected</span>
            <Button onClick={handleCreate} disabled={selected.size === 0 || submitting}>
              {submitting ? 'Creating…' : 'Create batch'}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
