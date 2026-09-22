'use client';

import { useState } from 'react';
import { StatusBadge } from '../../components/StatusBadge';
import { Button, Card, EmptyState, ErrorBanner, Field, Input, Loading, PageHeader, Textarea } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { useApiData } from '../../lib/use-api-data';
import type { MatchException } from '../../lib/types';

interface DraftLine {
  poLineId: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

export default function MatchExceptionsPage() {
  const { data: exceptions, error, loading, reload } = useApiData<MatchException[]>('/match-exceptions?status=OPEN');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftLine[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function startAdjust(exception: MatchException) {
    setDrafts((prev) => ({
      ...prev,
      [exception.id]: (exception.invoice?.lines ?? []).map((line) => ({
        poLineId: line.poLineId,
        description: line.description,
        quantity: String(line.quantity),
        unitPrice: (line.unitPriceMinorUnits / 100).toFixed(2),
      })),
    }));
  }

  function updateDraftLine(exceptionId: string, index: number, patch: Partial<DraftLine>) {
    setDrafts((prev) => ({
      ...prev,
      [exceptionId]: prev[exceptionId].map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  }

  async function requestCreditNote(exception: MatchException) {
    const note = notes[exception.id]?.trim();
    if (!note) {
      setActionError('Add a note describing the credit note request.');
      return;
    }
    setActionError(null);
    setBusyId(exception.id);
    try {
      await apiFetch(`/match-exceptions/${exception.id}/request-credit-note`, {
        method: 'POST',
        body: { notes: note },
      });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to request credit note');
    } finally {
      setBusyId(null);
    }
  }

  async function adjustAndRematch(exception: MatchException) {
    const lines = drafts[exception.id];
    if (!lines) return;
    setActionError(null);
    setBusyId(exception.id);
    try {
      await apiFetch(`/match-exceptions/${exception.id}/adjust-and-rematch`, {
        method: 'POST',
        body: {
          lines: lines.map((l) => ({
            poLineId: l.poLineId,
            description: l.description,
            quantity: Number(l.quantity),
            unitPriceMinorUnits: Math.round(Number(l.unitPrice) * 100),
          })),
        },
      });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to adjust and re-match');
    } finally {
      setBusyId(null);
    }
  }

  async function manualOverride(exception: MatchException) {
    const note = notes[exception.id]?.trim();
    if (!note) {
      setActionError('A reason is required for a manual override (admin only).');
      return;
    }
    setActionError(null);
    setBusyId(exception.id);
    try {
      await apiFetch(`/match-exceptions/${exception.id}/manual-override`, {
        method: 'POST',
        body: { reason: note },
      });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to override (admin role required)');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title="Match exceptions" subtitle="Invoices that didn't cleanly match their purchase order — resolve before payment." />

      {error && <ErrorBanner message={error} />}
      {actionError && <ErrorBanner message={actionError} />}
      {loading && <Loading />}

      {!loading && !error && exceptions && exceptions.length === 0 && <EmptyState>No open match exceptions.</EmptyState>}

      {!loading && !error && exceptions && exceptions.length > 0 && (
        <div className="space-y-4">
          {exceptions.map((exception) => (
            <Card key={exception.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-stone-900 dark:text-stone-50">
                  {exception.invoice?.vendor?.legalName ?? ''} — invoice {exception.invoice?.invoiceNumber}
                </div>
                <StatusBadge status={exception.status} />
              </div>
              <div className="text-xs text-stone-500">Raised {formatDate(exception.createdAt)}</div>

              <ul className="list-inside list-disc text-sm text-stone-600 dark:text-stone-400">
                {exception.diff
                  .filter((d) => !d.ok)
                  .map((d, i) => (
                    <li key={i}>
                      {d.matchType} mismatch — invoice {d.invoiceQuantity} ×{' '}
                      {formatMoney(d.invoicePriceMinorUnits, exception.invoice?.currency ?? 'INR')} vs reference {d.referenceQuantity} ×{' '}
                      {formatMoney(d.referencePriceMinorUnits, exception.invoice?.currency ?? 'INR')}
                      {d.reasons.length > 0 ? ` (${d.reasons.join('; ')})` : ''}
                    </li>
                  ))}
              </ul>

              <Field label="Notes / reason" hint="Used for credit-note requests and manual overrides.">
                <Textarea
                  rows={2}
                  value={notes[exception.id] ?? ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [exception.id]: e.target.value }))}
                />
              </Field>

              {drafts[exception.id] && (
                <div className="space-y-2 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                  <p className="text-xs font-medium uppercase text-stone-500">Adjust invoice lines</p>
                  {drafts[exception.id].map((line, index) => (
                    <div key={line.poLineId} className="grid gap-2 sm:grid-cols-3">
                      <Input value={line.description} disabled />
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateDraftLine(exception.id, index, { quantity: e.target.value })}
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => updateDraftLine(exception.id, index, { unitPrice: e.target.value })}
                      />
                    </div>
                  ))}
                  <Button onClick={() => adjustAndRematch(exception)} disabled={busyId === exception.id}>
                    Save adjustment &amp; re-match
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!drafts[exception.id] && (
                  <Button variant="secondary" onClick={() => startAdjust(exception)} disabled={busyId === exception.id}>
                    Adjust and re-match
                  </Button>
                )}
                <Button variant="secondary" onClick={() => requestCreditNote(exception)} disabled={busyId === exception.id}>
                  Request credit note
                </Button>
                <Button variant="danger" onClick={() => manualOverride(exception)} disabled={busyId === exception.id}>
                  Manual override (admin)
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
