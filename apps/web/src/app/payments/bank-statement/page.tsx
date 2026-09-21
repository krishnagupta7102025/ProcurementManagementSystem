'use client';

import { useState } from 'react';
import { StatusBadge } from '../../../components/StatusBadge';
import { Button, Card, EmptyState, ErrorBanner, Loading, PageHeader, Select, Table, Td, Textarea, Th, TRow } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { formatDate, formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import { useUser } from '../../../lib/user-context';
import type { BankStatementLine, PaymentBatch } from '../../../lib/types';

const SAMPLE_CSV = `date,description,amountMinorUnits,reference\n2026-09-20,NEFT to Acme Supplies,8500000,REF123`;

export default function BankStatementPage() {
  const { user } = useUser();
  const { data: lines, error, loading, reload } = useApiData<BankStatementLine[]>('/bank-statement-lines');
  const { data: releasedBatches } = useApiData<PaymentBatch[]>('/payment-batches?status=RELEASED');

  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [reconcileChoice, setReconcileChoice] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setImportError(null);
    if (!csv.trim()) {
      setImportError('Paste some CSV content first.');
      return;
    }
    setImporting(true);
    try {
      await apiFetch('/bank-statement-lines/import', { method: 'POST', userEmail: user.email, body: { csv } });
      setCsv('');
      await reload();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import statement');
    } finally {
      setImporting(false);
    }
  }

  async function reconcile(lineId: string) {
    const paymentBatchId = reconcileChoice[lineId];
    if (!paymentBatchId) {
      setActionError('Select a released payment batch to match this line against.');
      return;
    }
    setActionError(null);
    setBusyId(lineId);
    try {
      await apiFetch(`/bank-statement-lines/${lineId}/reconcile`, { method: 'POST', userEmail: user.email, body: { paymentBatchId } });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reconcile');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Bank statement reconciliation"
        subtitle="Import a bank statement CSV and match its lines against released payment batches."
      />

      <Card className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">Import statement</h2>
        {importError && <ErrorBanner message={importError} />}
        <form onSubmit={handleImport} className="space-y-3">
          <Textarea
            rows={5}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={SAMPLE_CSV}
            className="font-mono text-xs"
          />
          <p className="text-xs text-stone-500">
            One header row, then <code>date,description,amountMinorUnits,reference</code> — amount is in integer minor units (paise), not
            decimal currency.
          </p>
          <Button type="submit" disabled={importing}>
            {importing ? 'Importing…' : 'Import CSV'}
          </Button>
        </form>
      </Card>

      {error && <ErrorBanner message={error} />}
      {actionError && <ErrorBanner message={actionError} />}
      {loading && <Loading />}

      {!loading && !error && lines && lines.length === 0 && <EmptyState>No bank statement lines imported yet.</EmptyState>}

      {!loading && !error && lines && lines.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Description</Th>
              <Th>Amount</Th>
              <Th>Reference</Th>
              <Th>Status</Th>
              <Th>Reconcile against</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <TRow key={line.id}>
                <Td>{formatDate(line.transactionDate)}</Td>
                <Td>{line.description}</Td>
                <Td>{formatMoney(line.amountMinorUnits)}</Td>
                <Td>{line.reference ?? '—'}</Td>
                <Td>
                  <StatusBadge status={line.matchedPaymentBatchId ? 'RESOLVED' : 'OPEN'} />
                </Td>
                <Td>
                  {line.matchedPaymentBatchId ? (
                    <span className="text-xs text-stone-500">Matched {line.matchedAt ? formatDate(line.matchedAt) : ''}</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Select
                        value={reconcileChoice[line.id] ?? ''}
                        onChange={(e) => setReconcileChoice((prev) => ({ ...prev, [line.id]: e.target.value }))}
                        className="text-xs"
                      >
                        <option value="">Select a batch</option>
                        {releasedBatches?.map((batch) => (
                          <option key={batch.id} value={batch.id}>
                            {formatMoney(batch.totalAmountMinorUnits, batch.currency)} — {batch.referenceNumber ?? batch.id.slice(0, 8)}
                          </option>
                        ))}
                      </Select>
                      <Button variant="secondary" onClick={() => reconcile(line.id)} disabled={busyId === line.id}>
                        Match
                      </Button>
                    </div>
                  )}
                </Td>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
