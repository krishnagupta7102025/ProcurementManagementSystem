'use client';

import { useState } from 'react';
import { StatusBadge } from '../../../components/StatusBadge';
import { Button, Card, ErrorBanner, Field, Input, Loading, PageHeader, Table, Td, Th, TRow } from '../../../components/ui';
import { WithIdParam } from '../../../components/WithIdParam';
import { apiFetch } from '../../../lib/api';
import { formatDate, formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import type { PaymentBatch } from '../../../lib/types';

export default function PaymentBatchDetailPage() {
  return <WithIdParam>{(id) => <PaymentBatchDetail id={id} />}</WithIdParam>;
}

function PaymentBatchDetail({ id }: { id: string }) {
  const { data: batch, error, loading, reload } = useApiData<PaymentBatch>(`/payment-batches/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState('NEFT');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cancelReason, setCancelReason] = useState('');

  async function runAction(path: string, body?: unknown) {
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/payment-batches/${id}${path}`, { method: 'POST', body: body ?? {} });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    if (!referenceNumber) {
      setActionError('Enter a reference number before releasing.');
      return;
    }
    await runAction('/release', { method, referenceNumber, paymentDate: new Date(paymentDate).toISOString() });
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!batch) return null;

  return (
    <div>
      <PageHeader
        title={`Payment batch — ${batch.lines.length} invoice(s)`}
        subtitle={`Created ${formatDate(batch.createdAt)}`}
        action={
          <div className="flex flex-wrap gap-2">
            {batch.status === 'PENDING_APPROVAL' && (
              <Button onClick={() => runAction('/approve')} disabled={busy}>
                Approve
              </Button>
            )}
            {batch.status !== 'RELEASED' && batch.status !== 'CANCELLED' && (
              <Button variant="danger" onClick={() => runAction('/cancel', { reason: cancelReason || 'Cancelled by AP' })} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {actionError && <ErrorBanner message={actionError} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Status</div>
          <div className="mt-1">
            <StatusBadge status={batch.status} />
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Total</div>
          <div className="mt-1 text-sm text-stone-800 dark:text-stone-200">{formatMoney(batch.totalAmountMinorUnits, batch.currency)}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Released</div>
          <div className="mt-1 text-sm text-stone-800 dark:text-stone-200">{batch.clearedAt ? formatDate(batch.clearedAt) : 'Not yet'}</div>
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">Invoices in this batch</h2>
      <Table>
        <thead>
          <tr>
            <Th>Vendor</Th>
            <Th>Invoice #</Th>
            <Th>Amount</Th>
          </tr>
        </thead>
        <tbody>
          {batch.lines.map((line) => (
            <TRow key={line.id}>
              <Td>{line.invoice?.vendor?.legalName ?? ''}</Td>
              <Td>{line.invoice?.invoiceNumber ?? line.invoiceId}</Td>
              <Td>{formatMoney(line.amountMinorUnits, batch.currency)}</Td>
            </TRow>
          ))}
        </tbody>
      </Table>

      {batch.status !== 'RELEASED' && batch.status !== 'CANCELLED' && (
        <Card className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Release payment</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Method">
              <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="NEFT / RTGS / cheque" />
            </Field>
            <Field label="Reference number">
              <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Bank reference" />
            </Field>
            <Field label="Payment date">
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Cancellation reason" hint="Used only if you click Cancel above.">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancelling" />
          </Field>
          <Button onClick={release} disabled={busy}>
            Release payment
          </Button>
        </Card>
      )}
    </div>
  );
}
