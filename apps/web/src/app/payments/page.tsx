'use client';

import { EmptyState, ErrorBanner, Loading, LinkButton, PageHeader, Table, Td, TdLink, Th, TRow } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate, formatMoney } from '../../lib/format';
import { useApiData } from '../../lib/use-api-data';
import type { PaymentBatch } from '../../lib/types';

export default function PaymentsPage() {
  const { data: batches, error, loading } = useApiData<PaymentBatch[]>('/payment-batches');

  return (
    <div>
      <PageHeader
        title="Payment batches"
        subtitle="Group approved invoices together and release payment."
        action={
          <div className="flex gap-2">
            <LinkButton href="/payments/bank-statement" variant="secondary">
              Reconcile bank statement
            </LinkButton>
            <LinkButton href="/payments/new">New payment batch</LinkButton>
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {!loading && !error && batches && batches.length === 0 && <EmptyState>No payment batches yet.</EmptyState>}

      {!loading && !error && batches && batches.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Invoices</Th>
              <Th>Total</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <TRow key={batch.id}>
                <TdLink href={`/payments/${batch.id}`}>{batch.lines.length} invoice(s)</TdLink>
                <Td>{formatMoney(batch.totalAmountMinorUnits, batch.currency)}</Td>
                <Td>
                  <StatusBadge status={batch.status} />
                </Td>
                <Td>{formatDate(batch.createdAt)}</Td>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
