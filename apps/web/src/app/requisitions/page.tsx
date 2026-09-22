'use client';

import { useState } from 'react';
import { EmptyState, ErrorBanner, Loading, PageHeader, LinkButton, Select, Table, Td, TdLink, Th, TRow } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate, formatMoney } from '../../lib/format';
import { useApiData } from '../../lib/use-api-data';
import type { Requisition } from '../../lib/types';

const STATUSES = ['', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'WITHDRAWN'];

export default function RequisitionsPage() {
  const [status, setStatus] = useState('');
  const query = status ? `?status=${status}` : '';
  const { data: requisitions, error, loading } = useApiData<Requisition[]>(`/requisitions${query}`);

  return (
    <div>
      <PageHeader
        title="Requisitions"
        subtitle="Raise a request to buy something and route it for approval."
        action={<LinkButton href="/requisitions/new">New requisition</LinkButton>}
      />

      <div className="mb-4">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-56">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? s.replaceAll('_', ' ') : 'All statuses'}
            </option>
          ))}
        </Select>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {!loading && !error && requisitions && requisitions.length === 0 && (
        <EmptyState>No requisitions match this filter.</EmptyState>
      )}

      {!loading && !error && requisitions && requisitions.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Department</Th>
              <Th>Requester</Th>
              <Th>Estimated total</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {requisitions.map((r) => (
              <TRow key={r.id}>
                <TdLink href={`/requisitions/detail?id=${r.id}`}>{r.department}</TdLink>
                <Td>{r.requester?.displayName ?? '—'}</Td>
                <Td>{formatMoney(r.estimatedTotalMinorUnits, r.currency)}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td>{formatDate(r.createdAt)}</Td>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
