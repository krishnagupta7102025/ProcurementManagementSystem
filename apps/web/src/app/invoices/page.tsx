'use client';

import { EmptyState, ErrorBanner, Loading, LinkButton, PageHeader, Table, Td, TdLink, Th, TRow } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate, formatMoney } from '../../lib/format';
import { useApiData } from '../../lib/use-api-data';
import type { Invoice } from '../../lib/types';

export default function InvoicesPage() {
  const { data: invoices, error, loading } = useApiData<Invoice[]>('/invoices');

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Record vendor invoices and match them against purchase orders."
        action={<LinkButton href="/invoices/new">New invoice</LinkButton>}
      />

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {!loading && !error && invoices && invoices.length === 0 && <EmptyState>No invoices recorded yet.</EmptyState>}

      {!loading && !error && invoices && invoices.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Vendor</Th>
              <Th>Invoice #</Th>
              <Th>Total</Th>
              <Th>Status</Th>
              <Th>Date</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <TRow key={inv.id}>
                <TdLink href={`/invoices/detail?id=${inv.id}`}>{inv.vendor?.legalName ?? inv.vendorId}</TdLink>
                <Td>{inv.invoiceNumber}</Td>
                <Td>{formatMoney(inv.totalMinorUnits, inv.currency)}</Td>
                <Td>
                  <StatusBadge status={inv.status} />
                </Td>
                <Td>{formatDate(inv.invoiceDate)}</Td>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
