'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, Field, Input, Loading, PageHeader, Table, Td, Th, TRow } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useApiData } from '../../../lib/use-api-data';
import { useRequiredUser } from '../../../lib/auth-context';
import type { OrgUser, UserRole } from '../../../lib/types';

const ALL_ROLES: UserRole[] = ['REQUESTER', 'APPROVER', 'BUYER', 'RECEIVER', 'AP', 'CONTROLLER', 'ADMIN'];

export default function UsersSettingsPage() {
  const user = useRequiredUser();
  const { data: users, error, loading, reload } = useApiData<OrgUser[]>('/users');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<Set<UserRole>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleRole(role: UserRole) {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (roles.size === 0) {
      setFormError('Select at least one role for this user.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: { email, displayName, password, roles: [...roles] },
      });
      setEmail('');
      setDisplayName('');
      setPassword('');
      setRoles(new Set());
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="Provision users ahead of their first sign-in and assign the roles they need." />

      {user.roles.includes('ADMIN') && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">New user</h2>
          {formError && <ErrorBanner message={formError} />}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
              </Field>
              <Field label="Full name">
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" required />
              </Field>
              <Field label="Initial password" hint="At least 8 characters. Share it with the user directly — there's no email invite flow.">
                <Input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Temp1234"
                  minLength={8}
                  required
                />
              </Field>
            </div>
            <Field label="Roles">
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map((role) => (
                  <label
                    key={role}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      roles.has(role)
                        ? 'border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
                        : 'border-stone-300 text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400'
                    }`}
                  >
                    <input type="checkbox" className="hidden" checked={roles.has(role)} onChange={() => toggleRole(role)} />
                    {role}
                  </label>
                ))}
              </div>
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create user'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorBanner message={error} />}
      {loading && <Loading />}

      {!loading && !error && users && users.length === 0 && <EmptyState>No users yet.</EmptyState>}

      {!loading && !error && users && users.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Roles</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <TRow key={u.id}>
                <Td>{u.displayName}</Td>
                <Td>{u.email}</Td>
                <Td>{u.roles.join(', ')}</Td>
                <Td>{formatDate(u.createdAt)}</Td>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
