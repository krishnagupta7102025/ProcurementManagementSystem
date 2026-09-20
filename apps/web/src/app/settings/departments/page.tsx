'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, Field, Input, Loading, PageHeader, Table, Td, Th, TRow } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { useApiData } from '../../../lib/use-api-data';
import { useUser } from '../../../lib/user-context';
import type { CostCenter } from '../../../lib/types';

export default function DepartmentsSettingsPage() {
  const { user } = useUser();
  const { data: costCenters, error, loading, reload } = useApiData<CostCenter[]>('/cost-centers');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch('/cost-centers', { method: 'POST', userEmail: user.email, body: { code, name, department } });
      setCode('');
      setName('');
      setDepartment('');
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create department');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Departments" subtitle="Cost centers that requisitions are raised against." />

      {user.role === 'ADMIN' && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">New department</h2>
          {formError && <ErrorBanner message={formError} />}
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-4">
            <Field label="Code">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ENG-100" required />
            </Field>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Engineering" required />
            </Field>
            <Field label="Department">
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering" required />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {!loading && !error && costCenters && costCenters.length === 0 && <EmptyState>No departments yet.</EmptyState>}

      {!loading && !error && costCenters && costCenters.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Department</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {costCenters.map((cc) => (
              <TRow key={cc.id}>
                <Td>{cc.code}</Td>
                <Td>{cc.name}</Td>
                <Td>{cc.department}</Td>
                <Td>{cc.isActive ? 'Active' : 'Inactive'}</Td>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
