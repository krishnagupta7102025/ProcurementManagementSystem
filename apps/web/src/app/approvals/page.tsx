'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, Loading, PageHeader, Textarea } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { formatDateTime, formatMoney } from '../../lib/format';
import { useApiData } from '../../lib/use-api-data';
import { useUser } from '../../lib/user-context';
import type { PendingApprovalStep } from '../../lib/types';

export default function ApprovalsPage() {
  const { user } = useUser();
  const { data: steps, error, loading, reload } = useApiData<PendingApprovalStep[]>('/approvals/pending');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(step: PendingApprovalStep, action: 'approve' | 'reject' | 'request-changes') {
    const reason = reasons[step.id]?.trim();
    if (action !== 'approve' && !reason) {
      setActionError('A reason is required to reject or request changes.');
      return;
    }
    setActionError(null);
    setBusyId(step.id);
    try {
      await apiFetch(`/approvals/requisitions/${step.requisitionId}/${action}`, {
        method: 'POST',
        userEmail: user.email,
        body: reason ? { reason } : {},
      });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title="My approvals" subtitle="Requisitions waiting on your decision." />

      {error && <ErrorBanner message={error} />}
      {actionError && <ErrorBanner message={actionError} />}
      {loading && <Loading />}

      {!loading && !error && steps && steps.length === 0 && <EmptyState>Nothing is waiting on you right now.</EmptyState>}

      {!loading && !error && steps && steps.length > 0 && (
        <div className="space-y-4">
          {steps.map((step) => (
            <Card key={step.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">
                    {step.requisition.department} — {formatMoney(step.requisition.estimatedTotalMinorUnits, step.requisition.currency)}
                  </div>
                  <div className="mt-0.5 text-sm text-zinc-500">
                    Requested by {step.requisition.requester?.displayName ?? 'unknown'}
                    {step.becameActiveAt ? ` · waiting since ${formatDateTime(step.becameActiveAt)}` : ''}
                  </div>
                  {step.requisition.justification && (
                    <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{step.requisition.justification}</div>
                  )}
                </div>
              </div>

              <ul className="list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
                {step.requisition.lines.map((line) => (
                  <li key={line.id}>
                    {line.quantity} × {line.description} ({formatMoney(line.estimatedUnitPriceMinorUnits, step.requisition.currency)} each)
                  </li>
                ))}
              </ul>

              <Textarea
                placeholder="Reason (required to reject or request changes)"
                rows={2}
                value={reasons[step.id] ?? ''}
                onChange={(e) => setReasons((prev) => ({ ...prev, [step.id]: e.target.value }))}
              />

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => act(step, 'approve')} disabled={busyId === step.id}>
                  Approve
                </Button>
                <Button variant="secondary" onClick={() => act(step, 'request-changes')} disabled={busyId === step.id}>
                  Request changes
                </Button>
                <Button variant="danger" onClick={() => act(step, 'reject')} disabled={busyId === step.id}>
                  Reject
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
