'use client';

import { use, useState } from 'react';
import { StatusBadge } from '../../../components/StatusBadge';
import { Button, Card, ErrorBanner, Field, Input, Loading, PageHeader, Select, Table, Td, Textarea, Th, TRow } from '../../../components/ui';
import { apiFetch, fetchFileBlob } from '../../../lib/api';
import { formatDate, formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import { useUser } from '../../../lib/user-context';
import type { GoodsReceipt, PurchaseOrder } from '../../../lib/types';

export default function PurchaseOrderDetailPage(props: PageProps<'/purchase-orders/[id]'>) {
  const { id } = use(props.params);
  const { user } = useUser();
  const { data: po, error, loading, reload } = useApiData<PurchaseOrder>(`/purchase-orders/${id}`);
  const { data: receipts, reload: reloadReceipts } = useApiData<GoodsReceipt[]>(`/purchase-orders/${id}/goods-receipts`);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [vendorMessage, setVendorMessage] = useState('');
  const [grnLineId, setGrnLineId] = useState('');
  const [grnQuantity, setGrnQuantity] = useState('1');
  const [grnNotes, setGrnNotes] = useState('');

  async function runAction(path: string, body?: unknown) {
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/purchase-orders/${id}${path}`, { method: 'POST', userEmail: user.email, body: body ?? {} });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function recordGrn(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/purchase-orders/${id}/goods-receipts`, {
        method: 'POST',
        userEmail: user.email,
        body: {
          lines: [{ poLineId: grnLineId, quantityReceived: Number(grnQuantity), conditionNotes: grnNotes || undefined }],
        },
      });
      setGrnLineId('');
      setGrnQuantity('1');
      setGrnNotes('');
      await Promise.all([reload(), reloadReceipts()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to record goods receipt');
    } finally {
      setBusy(false);
    }
  }

  async function confirmService(poLineId: string) {
    await runAction('/goods-receipts/service-confirmations', { poLineId });
    await reloadReceipts();
  }

  async function viewPdf() {
    setActionError(null);
    setBusy(true);
    // Opened synchronously, before the awaits below, so browsers still treat
    // it as a direct result of the click — opening it after an await gets
    // treated as an unrequested popup and blocked by some browsers.
    const tab = window.open('', '_blank');
    try {
      const { downloadUrl } = await apiFetch<{ downloadUrl: string }>(`/purchase-orders/${id}/pdf`, {
        method: 'POST',
        userEmail: user.email,
      });
      const blob = await fetchFileBlob(downloadUrl, user.email);
      if (tab) tab.location.href = URL.createObjectURL(blob);
    } catch (err) {
      tab?.close();
      setActionError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!po) return null;

  const receivableLines = po.lines.filter((l) => !l.isService);
  const serviceLines = po.lines.filter((l) => l.isService);

  return (
    <div>
      <PageHeader
        title={`PO — ${po.vendor?.legalName ?? po.vendorId}`}
        subtitle={`Created ${formatDate(po.createdAt)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={viewPdf} disabled={busy}>
              View PDF
            </Button>
            {po.status === 'DRAFT' && (
              <Button onClick={() => runAction('/issue')} disabled={busy}>
                Issue
              </Button>
            )}
            {po.status === 'PENDING_APPROVAL' && (
              <Button onClick={() => runAction('/approve-variance')} disabled={busy}>
                Approve variance
              </Button>
            )}
            {po.status === 'ISSUED' && !po.sentToVendorAt && (
              <Button variant="secondary" onClick={() => runAction('/send-to-vendor', { message: vendorMessage || 'Please find our PO attached.' })} disabled={busy}>
                Send to vendor
              </Button>
            )}
            {po.status !== 'CANCELLED' && po.status !== 'CLOSED' && (
              <Button variant="danger" onClick={() => runAction('/cancel', { reason: cancelReason || 'Cancelled by buyer' })} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {actionError && <ErrorBanner message={actionError} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Status</div>
          <div className="mt-1">
            <StatusBadge status={po.status} />
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Negotiated total</div>
          <div className="mt-1 text-sm text-stone-800 dark:text-stone-200">{formatMoney(po.negotiatedTotalMinorUnits, po.currency)}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Sent to vendor</div>
          <div className="mt-1 text-sm text-stone-800 dark:text-stone-200">{po.sentToVendorAt ? formatDate(po.sentToVendorAt) : 'Not yet'}</div>
        </Card>
      </div>

      {po.status === 'ISSUED' && !po.sentToVendorAt && (
        <Card className="mb-6">
          <Field label="Message to vendor" hint="Sent along with the PO when you click 'Send to vendor' above.">
            <Textarea rows={2} value={vendorMessage} onChange={(e) => setVendorMessage(e.target.value)} placeholder="Please find our PO attached." />
          </Field>
        </Card>
      )}

      {po.status !== 'CANCELLED' && po.status !== 'CLOSED' && (
        <Card className="mb-6">
          <Field label="Cancellation reason" hint="Used only if you click Cancel above.">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancelling" />
          </Field>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">Lines</h2>
      <Table>
        <thead>
          <tr>
            <Th>Description</Th>
            <Th>Quantity</Th>
            <Th>Unit</Th>
            <Th>Unit price</Th>
            <Th>Line total</Th>
            <Th>Type</Th>
          </tr>
        </thead>
        <tbody>
          {po.lines.map((line) => (
            <TRow key={line.id}>
              <Td>{line.description}</Td>
              <Td>{line.quantity}</Td>
              <Td>{line.unit}</Td>
              <Td>{formatMoney(line.unitPriceMinorUnits, po.currency)}</Td>
              <Td>{formatMoney(line.unitPriceMinorUnits * line.quantity, po.currency)}</Td>
              <Td>{line.isService ? 'Service' : 'Goods'}</Td>
            </TRow>
          ))}
        </tbody>
      </Table>

      {serviceLines.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-stone-700 dark:text-stone-300">Service confirmations</h2>
          <Card className="space-y-2">
            {serviceLines.map((line) => (
              <div key={line.id} className="flex items-center justify-between border-b border-stone-100 pb-2 last:border-0 last:pb-0 dark:border-stone-800">
                <span className="text-sm text-stone-700 dark:text-stone-300">{line.description}</span>
                <Button variant="secondary" onClick={() => confirmService(line.id)} disabled={busy}>
                  Confirm delivered
                </Button>
              </div>
            ))}
          </Card>
        </>
      )}

      {receivableLines.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-stone-700 dark:text-stone-300">Goods receipts</h2>
          <Card className="mb-4 space-y-3">
            {receipts && receipts.length > 0 ? (
              <div className="space-y-2">
                {receipts.map((grn) => (
                  <div key={grn.id} className="border-b border-stone-100 pb-2 text-sm last:border-0 last:pb-0 dark:border-stone-800">
                    <span className="text-stone-500">{formatDate(grn.receivedDate)}</span>{' '}
                    {grn.lines.map((l) => `${l.quantityReceived} × ${l.poLine?.description ?? l.poLineId}`).join(', ')}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">No goods received yet.</p>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">Record a goods receipt</h3>
            <form onSubmit={recordGrn} className="grid gap-3 sm:grid-cols-4">
              <Field label="Line">
                <Select value={grnLineId} onChange={(e) => setGrnLineId(e.target.value)} required>
                  <option value="" disabled>
                    Select a line
                  </option>
                  {receivableLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.description}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity received">
                <Input type="number" min={1} value={grnQuantity} onChange={(e) => setGrnQuantity(e.target.value)} required />
              </Field>
              <Field label="Condition notes">
                <Input value={grnNotes} onChange={(e) => setGrnNotes(e.target.value)} placeholder="Optional" />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={busy} className="w-full">
                  Record
                </Button>
              </div>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
