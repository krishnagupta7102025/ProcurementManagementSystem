'use client';

import { use, useRef, useState } from 'react';
import { StatusBadge } from '../../../components/StatusBadge';
import { Button, Card, ErrorBanner, Input, Loading, PageHeader, Table, Td, Th, TRow } from '../../../components/ui';
import { apiFetch, fetchFileBlob } from '../../../lib/api';
import { fileToBase64 } from '../../../lib/file';
import { formatDate, formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import { useUser } from '../../../lib/user-context';
import type { Invoice } from '../../../lib/types';

export default function InvoiceDetailPage(props: PageProps<'/invoices/[id]'>) {
  const { id } = use(props.params);
  const { user } = useUser();
  const { data: invoice, error, loading, reload } = useApiData<Invoice>(`/invoices/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function runAction(path: string, body?: unknown) {
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/invoices/${id}${path}`, { method: 'POST', userEmail: user.email, body: body ?? {} });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
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
      await apiFetch(`/invoices/${id}/file`, {
        method: 'POST',
        userEmail: user.email,
        body: { fileName: file.name, contentType: file.type || 'application/octet-stream', base64Content },
      });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function viewFile() {
    setActionError(null);
    const tab = window.open('', '_blank');
    try {
      const { downloadUrl } = await apiFetch<{ downloadUrl: string }>(`/invoices/${id}/file/download`, { userEmail: user.email });
      const blob = await fetchFileBlob(downloadUrl, user.email);
      if (tab) tab.location.href = URL.createObjectURL(blob);
    } catch (err) {
      tab?.close();
      setActionError(err instanceof Error ? err.message : 'Failed to open document');
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!invoice) return null;

  const openExceptions = (invoice.matchExceptions ?? []).filter((e) => e.status === 'OPEN');

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        subtitle={`${invoice.vendor?.legalName ?? invoice.vendorId} · dated ${formatDate(invoice.invoiceDate)}`}
        action={
          <div className="flex flex-wrap gap-2">
            {invoice.status === 'DRAFT' && (
              <Button onClick={() => runAction('/submit')} disabled={busy}>
                Submit for matching
              </Button>
            )}
            {invoice.status === 'MATCHED' && (
              <Button onClick={() => runAction('/approve')} disabled={busy}>
                Approve for payment
              </Button>
            )}
            {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
              <Button variant="danger" onClick={() => runAction('/void', { reason: voidReason || 'Voided by AP' })} disabled={busy}>
                Void
              </Button>
            )}
          </div>
        }
      />

      {actionError && <ErrorBanner message={actionError} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Status</div>
          <div className="mt-1">
            <StatusBadge status={invoice.status} />
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Subtotal</div>
          <div className="mt-1 text-sm text-stone-800 dark:text-stone-200">{formatMoney(invoice.subtotalMinorUnits, invoice.currency)}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Tax</div>
          <div className="mt-1 text-sm text-stone-800 dark:text-stone-200">{formatMoney(invoice.taxMinorUnits, invoice.currency)}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-stone-500">Total</div>
          <div className="mt-1 text-sm text-stone-800 dark:text-stone-200">{formatMoney(invoice.totalMinorUnits, invoice.currency)}</div>
        </Card>
      </div>

      {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
        <Card className="mb-6">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Void reason</span>
            <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Used only if you click Void above" />
          </label>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">Vendor document</h2>
      <Card className="mb-8 space-y-3">
        {invoice.fileS3Key ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-700 dark:text-stone-300">A document is attached to this invoice.</span>
            <Button variant="secondary" onClick={viewFile}>
              View
            </Button>
          </div>
        ) : (
          <p className="text-sm text-stone-500">No scanned copy of the vendor&apos;s invoice has been uploaded yet.</p>
        )}
        <div>
          <input ref={fileInputRef} type="file" onChange={handleFileSelected} disabled={uploading} className="text-sm" />
          {uploading && <p className="mt-1 text-xs text-stone-500">Uploading…</p>}
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">Lines</h2>
      <Table>
        <thead>
          <tr>
            <Th>Description</Th>
            <Th>PO line</Th>
            <Th>Quantity</Th>
            <Th>Unit price</Th>
            <Th>Line total</Th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <TRow key={line.id}>
              <Td>{line.description}</Td>
              <Td>{line.poLine?.description ?? line.poLineId}</Td>
              <Td>{line.quantity}</Td>
              <Td>{formatMoney(line.unitPriceMinorUnits, invoice.currency)}</Td>
              <Td>{formatMoney(line.unitPriceMinorUnits * line.quantity, invoice.currency)}</Td>
            </TRow>
          ))}
        </tbody>
      </Table>

      {openExceptions.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-stone-700 dark:text-stone-300">Match exceptions</h2>
          <Card className="space-y-4">
            {openExceptions.map((exception) => (
              <div key={exception.id} className="space-y-2 border-b border-stone-100 pb-4 last:border-0 last:pb-0 dark:border-stone-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    Raised {formatDate(exception.createdAt)}
                  </span>
                  <StatusBadge status={exception.status} />
                </div>
                <ul className="list-inside list-disc text-sm text-stone-600 dark:text-stone-400">
                  {exception.diff
                    .filter((d) => !d.ok)
                    .map((d, i) => (
                      <li key={i}>
                        {d.matchType} mismatch — invoice {d.invoiceQuantity} × {formatMoney(d.invoicePriceMinorUnits, invoice.currency)} vs
                        reference {d.referenceQuantity} × {formatMoney(d.referencePriceMinorUnits, invoice.currency)}
                        {d.reasons.length > 0 ? ` (${d.reasons.join('; ')})` : ''}
                      </li>
                    ))}
                </ul>
                <p className="text-xs text-stone-500">
                  Resolve this from the{' '}
                  <a href="/match-exceptions" className="underline">
                    Match Exceptions
                  </a>{' '}
                  page.
                </p>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
