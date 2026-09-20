'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '../../../components/StatusBadge';
import { Button, Card, ErrorBanner, Loading, PageHeader, Table, Td, Th, TRow } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { formatDateTime, formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import { useUser } from '../../../lib/user-context';
import type { Requisition } from '../../../lib/types';

export default function RequisitionDetailPage(props: PageProps<'/requisitions/[id]'>) {
  const { id } = use(props.params);
  const router = useRouter();
  const { user } = useUser();
  const { data: requisition, error, loading, reload } = useApiData<Requisition>(`/requisitions/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runAction(action: 'submit' | 'withdraw' | 'clone') {
    setActionError(null);
    setBusy(true);
    try {
      const result = await apiFetch<Requisition>(`/requisitions/${id}/${action}`, { method: 'POST', userEmail: user.email });
      if (action === 'clone') {
        router.push(`/requisitions/${result.id}`);
      } else {
        await reload();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to ${action} requisition`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!requisition) return null;

  const canSubmit = requisition.status === 'DRAFT' || requisition.status === 'CHANGES_REQUESTED';
  const canWithdraw = requisition.status === 'SUBMITTED';

  return (
    <div>
      <PageHeader
        title={`Requisition — ${requisition.department}`}
        subtitle={`Raised by ${requisition.requester?.displayName ?? 'unknown'} on ${formatDateTime(requisition.createdAt)}`}
        action={
          <div className="flex gap-2">
            {canSubmit && (
              <Button onClick={() => runAction('submit')} disabled={busy}>
                Submit for approval
              </Button>
            )}
            {canWithdraw && (
              <Button variant="secondary" onClick={() => runAction('withdraw')} disabled={busy}>
                Withdraw
              </Button>
            )}
            <Button variant="secondary" onClick={() => runAction('clone')} disabled={busy}>
              Clone
            </Button>
          </div>
        }
      />

      {actionError && <ErrorBanner message={actionError} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <div className="text-xs font-medium uppercase text-zinc-500">Status</div>
          <div className="mt-1">
            <StatusBadge status={requisition.status} />
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-zinc-500">Cost center</div>
          <div className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
            {requisition.costCenter ? `${requisition.costCenter.code} — ${requisition.costCenter.name}` : requisition.costCenterId}
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-zinc-500">Estimated total</div>
          <div className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
            {formatMoney(requisition.estimatedTotalMinorUnits, requisition.currency)}
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-zinc-500">Justification</div>
          <div className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">{requisition.justification ?? '—'}</div>
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Line items</h2>
      <Table>
        <thead>
          <tr>
            <Th>Description</Th>
            <Th>Quantity</Th>
            <Th>Unit</Th>
            <Th>Est. unit price</Th>
            <Th>Est. line total</Th>
          </tr>
        </thead>
        <tbody>
          {requisition.lines.map((line) => (
            <TRow key={line.id}>
              <Td>{line.description}</Td>
              <Td>{line.quantity}</Td>
              <Td>{line.unit}</Td>
              <Td>{formatMoney(line.estimatedUnitPriceMinorUnits, requisition.currency)}</Td>
              <Td>{formatMoney(line.estimatedUnitPriceMinorUnits * line.quantity, requisition.currency)}</Td>
            </TRow>
          ))}
        </tbody>
      </Table>

      {requisition.approvalSteps && requisition.approvalSteps.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Approval timeline</h2>
          <Card className="space-y-3">
            {requisition.approvalSteps
              .slice()
              .sort((a, b) => a.stepOrder - b.stepOrder)
              .map((step) => (
                <div key={step.id} className="flex items-center justify-between border-b border-zinc-100 pb-3 last:border-0 last:pb-0 dark:border-zinc-800">
                  <div>
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Step {step.stepOrder} — {step.approver?.displayName ?? step.approverUserId}
                    </div>
                    {step.reason && <div className="mt-0.5 text-xs text-zinc-500">{step.reason}</div>}
                    {step.actedAt && <div className="mt-0.5 text-xs text-zinc-500">Acted {formatDateTime(step.actedAt)}</div>}
                  </div>
                  <StatusBadge status={step.status} />
                </div>
              ))}
          </Card>
        </>
      )}
    </div>
  );
}
