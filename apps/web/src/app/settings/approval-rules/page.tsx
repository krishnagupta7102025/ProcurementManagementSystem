'use client';

import { useMemo, useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, Field, Input, Loading, PageHeader, Select } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import { useUser } from '../../../lib/user-context';
import type { ApprovalRule, CostCenter, OrgUser } from '../../../lib/types';

interface DraftStep {
  approverUserId: string;
}

function emptyStep(): DraftStep {
  return { approverUserId: '' };
}

export default function ApprovalRulesSettingsPage() {
  const { user } = useUser();
  const { data: rules, error, loading, reload } = useApiData<ApprovalRule[]>('/approval-rules');
  const { data: costCenters } = useApiData<CostCenter[]>('/cost-centers');
  const { data: users } = useApiData<OrgUser[]>('/users');

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users ?? []) map.set(u.id, u.displayName);
    return map;
  }, [users]);

  const approvers = useMemo(() => (users ?? []).filter((u) => u.roles.includes('APPROVER') || u.roles.includes('ADMIN')), [users]);

  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [minAmount, setMinAmount] = useState('0');
  const [maxAmount, setMaxAmount] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([emptyStep()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function updateStep(index: number, approverUserId: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { approverUserId } : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, emptyStep()]);
  }

  function removeStep(index: number) {
    setSteps((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (steps.some((s) => !s.approverUserId)) {
      setFormError('Every step needs an approver.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/approval-rules', {
        method: 'POST',
        userEmail: user.email,
        body: {
          name,
          department: department || undefined,
          costCenterId: costCenterId || undefined,
          minAmountMinorUnits: Math.round(Number(minAmount || '0') * 100),
          maxAmountMinorUnits: maxAmount ? Math.round(Number(maxAmount) * 100) : undefined,
          steps: steps.map((s, i) => ({ stepOrder: i + 1, approverUserId: s.approverUserId })),
        },
      });
      setName('');
      setDepartment('');
      setCostCenterId('');
      setMinAmount('0');
      setMaxAmount('');
      setSteps([emptyStep()]);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create approval rule');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Approval rules"
        subtitle="Routes a submitted requisition to its approvers, based on department, cost center, and amount. A requisition with no matching rule cannot be submitted."
      />

      {user.role === 'ADMIN' && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">New rule</h2>
          {formError && <ErrorBanner message={formError} />}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rule name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering standard" required />
              </Field>
              <Field label="Department" hint="Leave blank to match any department.">
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Any department" />
              </Field>
              <Field label="Cost center" hint="Leave unset to match any cost center.">
                <Select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
                  <option value="">Any cost center</option>
                  {costCenters?.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.code} — {cc.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min amount">
                  <Input type="number" min={0} step="0.01" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
                </Field>
                <Field label="Max amount" hint="Blank = no max">
                  <Input type="number" min={0} step="0.01" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
                </Field>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-stone-700 dark:text-stone-300">Approval steps, in order</span>
                <Button type="button" variant="secondary" onClick={addStep}>
                  Add step
                </Button>
              </div>
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-sm text-stone-500">{index + 1}.</span>
                    <Select value={step.approverUserId} onChange={(e) => updateStep(index, e.target.value)} required className="flex-1">
                      <option value="" disabled>
                        Select an approver
                      </option>
                      {approvers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName} ({u.roles.join(', ')})
                        </option>
                      ))}
                    </Select>
                    <Button type="button" variant="danger" onClick={() => removeStep(index)} disabled={steps.length === 1}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create rule'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {!loading && !error && rules && rules.length === 0 && (
        <EmptyState>No approval rules yet — requisitions cannot be submitted until at least one exists.</EmptyState>
      )}

      {!loading && !error && rules && rules.length > 0 && (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-stone-900 dark:text-stone-50">{rule.name}</h3>
                  <p className="mt-1 text-sm text-stone-500">
                    {rule.department ?? 'Any department'} · {costCenters?.find((c) => c.id === rule.costCenterId)?.name ?? 'Any cost center'} ·{' '}
                    {formatMoney(rule.minAmountMinorUnits)}
                    {rule.maxAmountMinorUnits != null ? ` – ${formatMoney(rule.maxAmountMinorUnits)}` : '+'}
                  </p>
                </div>
              </div>
              <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-stone-600 dark:text-stone-400">
                {rule.steps.map((step) => (
                  <li key={step.stepOrder}>{userNameById.get(step.approverUserId) ?? step.approverUserId}</li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
