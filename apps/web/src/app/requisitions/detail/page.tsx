'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '../../../components/StatusBadge';
import { Button, Card, ErrorBanner, Loading, PageHeader, Table, Td, Th, TRow } from '../../../components/ui';
import { WithIdParam } from '../../../components/WithIdParam';
import { apiFetch, fetchFileBlob } from '../../../lib/api';
import { fileToBase64 } from '../../../lib/file';
import { formatDateTime, formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import type { Requisition } from '../../../lib/types';

export default function RequisitionDetailPage() {
  return <WithIdParam>{(id) => <RequisitionDetail id={id} />}</WithIdParam>;
}

function RequisitionDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: requisition, error, loading, reload } = useApiData<Requisition>(`/requisitions/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function runAction(action: 'submit' | 'withdraw' | 'clone') {
    setActionError(null);
    setBusy(true);
    try {
      const result = await apiFetch<Requisition>(`/requisitions/${id}/${action}`, { method: 'POST' });
      if (action === 'clone') {
        router.push(`/requisitions/detail?id=${result.id}`);
      } else {
        await reload();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to ${action} requisition`);
    } finally {
      setBusy(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionError(null);
    setUploading(true);
    try {
      const base64Content = await fileToBase64(file);
      await apiFetch(`/requisitions/${id}/attachments`, {
        method: 'POST',
        body: { fileName: file.name, contentType: file.type || 'application/octet-stream', base64Content },
      });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to upload attachment');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function viewAttachment(attachmentId: string) {
    setActionError(null);
    const tab = window.open('', '_blank');
    try {
      const { downloadUrl } = await apiFetch<{ downloadUrl: string }>(
        `/requisitions/${id}/attachments/${attachmentId}/download`,
        {},
      );
      const blob = await fetchFileBlob(downloadUrl);
      if (tab) tab.location.href = URL.createObjectURL(blob);
    } catch (err) {
      tab?.close();
      setActionError(err instanceof Error ? err.message : 'Failed to open attachment');
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
          <div className="text-xs font-medium uppercase text-stone-500">Status</div>
          <div className="mt-1">
            <StatusBadge status={requisition.status} />
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Cost center</div>
          <div className="mt-1 text-sm text-stone-800 dark:text-stone-200">
            {requisition.costCenter ? `${requisition.costCenter.code} — ${requisition.costCenter.name}` : requisition.costCenterId}
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Estimated total</div>
          <div className="mt-1 text-sm text-stone-800 dark:text-stone-200">
            {formatMoney(requisition.estimatedTotalMinorUnits, requisition.currency)}
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Justification</div>
          <div className="mt-1 text-sm text-stone-800 dark:text-stone-200">{requisition.justification ?? '—'}</div>
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">Line items</h2>
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

      <h2 className="mb-3 mt-8 text-sm font-semibold text-stone-700 dark:text-stone-300">Attachments</h2>
      <Card className="space-y-3">
        {requisition.attachments && requisition.attachments.length > 0 ? (
          <ul className="space-y-2">
            {requisition.attachments.map((att) => (
              <li key={att.id} className="flex items-center justify-between border-b border-stone-100 pb-2 last:border-0 last:pb-0 dark:border-stone-800">
                <span className="text-sm text-stone-700 dark:text-stone-300">{att.fileName}</span>
                <Button variant="secondary" onClick={() => viewAttachment(att.id)}>
                  View
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">No supporting documents attached yet.</p>
        )}
        <div>
          <input ref={fileInputRef} type="file" onChange={handleFileSelected} disabled={uploading} className="text-sm" />
          {uploading && <p className="mt-1 text-xs text-stone-500">Uploading…</p>}
        </div>
      </Card>

      {requisition.approvalSteps && requisition.approvalSteps.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-stone-700 dark:text-stone-300">Approval timeline</h2>
          <Card className="space-y-3">
            {requisition.approvalSteps
              .slice()
              .sort((a, b) => a.stepOrder - b.stepOrder)
              .map((step) => (
                <div key={step.id} className="flex items-center justify-between border-b border-stone-100 pb-3 last:border-0 last:pb-0 dark:border-stone-800">
                  <div>
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200">
                      Step {step.stepOrder} — {step.approver?.displayName ?? step.approverUserId}
                    </div>
                    {step.reason && <div className="mt-0.5 text-xs text-stone-500">{step.reason}</div>}
                    {step.actedAt && <div className="mt-0.5 text-xs text-stone-500">Acted {formatDateTime(step.actedAt)}</div>}
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
