'use client';

import { EmptyState, ErrorBanner, Loading, LinkButton, PageHeader, Table, Td, TdLink, Th, TRow } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate, formatMoney } from '../../lib/format';
import { useApiData } from '../../lib/use-api-data';
import type { PurchaseOrder } from '../../lib/types';

export default function PurchaseOrdersPage() {
  const { data: pos, error, loading } = useApiData<PurchaseOrder[]>('/purchase-orders');

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle="Issue orders to vendors against approved requisitions."
        action={<LinkButton href="/purchase-orders/new">New purchase order</LinkButton>}
      />

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {!loading && !error && pos && pos.length === 0 && <EmptyState>No purchase orders yet.</EmptyState>}

      {!loading && !error && pos && pos.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Vendor</Th>
              <Th>Total</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {pos.map((po) => (
              <TRow key={po.id}>
                <TdLink href={`/purchase-orders/${po.id}`}>{po.vendor?.legalName ?? po.vendorId}</TdLink>
                <Td>{formatMoney(po.negotiatedTotalMinorUnits, po.currency)}</Td>
                <Td>
                  <StatusBadge status={po.status} />
                </Td>
                <Td>{formatDate(po.createdAt)}</Td>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
