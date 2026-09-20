'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorBanner, Field, Input, Loading, PageHeader, Select, Textarea } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { useApiData } from '../../../lib/use-api-data';
import { useUser } from '../../../lib/user-context';
import type { CostCenter, Requisition } from '../../../lib/types';

interface DraftLine {
  description: string;
  quantity: string;
  unit: string;
  estimatedUnitPrice: string;
}

function emptyLine(): DraftLine {
  return { description: '', quantity: '1', unit: 'unit', estimatedUnitPrice: '' };
}

export default function NewRequisitionPage() {
  const router = useRouter();
  const { user } = useUser();
  const { data: costCenters, error: costCenterError, loading: costCentersLoading } = useApiData<CostCenter[]>('/cost-centers');

  const [costCenterId, setCostCenterId] = useState('');
  const [department, setDepartment] = useState('');
  const [justification, setJustification] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const requisition = await apiFetch<Requisition>('/requisitions', {
        method: 'POST',
        userEmail: user.email,
        body: {
          costCenterId,
          department,
          justification: justification || undefined,
          lines: lines.map((line) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unit: line.unit,
            estimatedUnitPriceMinorUnits: Math.round(Number(line.estimatedUnitPrice) * 100),
          })),
        },
      });
      router.push(`/requisitions/${requisition.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create requisition');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="New requisition" subtitle="Describe what you need to buy. You can submit it for approval afterwards." />

      {costCenterError && <ErrorBanner message={costCenterError} />}
      {error && <ErrorBanner message={error} />}

      {costCentersLoading ? (
        <Loading />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Card className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cost center">
                <Select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} required>
                  <option value="" disabled>
                    Select a cost center
                  </option>
                  {costCenters?.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.code} — {cc.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Department">
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} required placeholder="e.g. Engineering" />
              </Field>
            </div>
            <Field label="Justification" hint="Optional — helps your approver understand why this is needed.">
              <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3} />
            </Field>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Line items</h2>
              <Button type="button" variant="secondary" onClick={addLine}>
                Add line
              </Button>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-12 dark:border-zinc-800">
                  <div className="sm:col-span-5">
                    <Field label="Description">
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(index, { description: e.target.value })}
                        required
                        placeholder="e.g. Dell laptop"
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Quantity">
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: e.target.value })}
                        required
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Unit">
                      <Input value={line.unit} onChange={(e) => updateLine(index, { unit: e.target.value })} required />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Est. unit price">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.estimatedUnitPrice}
                        onChange={(e) => updateLine(index, { estimatedUnitPrice: e.target.value })}
                        required
                        placeholder="0.00"
                      />
                    </Field>
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                      className="w-full"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="submit" disabled={submitting || !costCenterId}>
              {submitting ? 'Creating…' : 'Create requisition'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
