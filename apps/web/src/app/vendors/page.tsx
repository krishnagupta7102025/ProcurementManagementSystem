'use client';

import { EmptyState, ErrorBanner, Loading, PageHeader, LinkButton, Table, Td, TdLink, Th, TRow } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { useApiData } from '../../lib/use-api-data';
import type { Vendor } from '../../lib/types';

export default function VendorsPage() {
  const { data: vendors, error, loading } = useApiData<Vendor[]>('/vendors');

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers you can raise purchase orders and invoices against."
        action={<LinkButton href="/vendors/new">New vendor</LinkButton>}
      />

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {!loading && !error && vendors && vendors.length === 0 && (
        <EmptyState>No vendors yet. Create one to get started.</EmptyState>
      )}

      {!loading && !error && vendors && vendors.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Legal name</Th>
              <Th>GSTIN</Th>
              <Th>Payment terms</Th>
              <Th>Contacts</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <TRow key={vendor.id}>
                <TdLink href={`/vendors/${vendor.id}`}>{vendor.legalName}</TdLink>
                <Td>{vendor.gstin ?? '—'}</Td>
                <Td>Net {vendor.paymentTermsDays}</Td>
                <Td>{vendor.contacts.map((c) => c.email).filter(Boolean).join(', ') || '—'}</Td>
                <Td>
                  <StatusBadge status={vendor.status} />
                </Td>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
