'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorBanner, Field, Input, PageHeader } from '../../../components/ui';
import { apiFetch, ApiError } from '../../../lib/api';
import { useUser } from '../../../lib/user-context';

export default function NewVendorPage() {
  const { user } = useUser();
  const router = useRouter();
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const contacts = contactName
        ? [{ name: contactName, email: contactEmail || undefined, phone: contactPhone || undefined }]
        : undefined;
      const vendor = await apiFetch<{ id: string }>('/vendors', {
        method: 'POST',
        userEmail: user.email,
        body: {
          legalName,
          gstin: gstin || undefined,
          paymentTermsDays: Number(paymentTermsDays),
          contacts,
        },
      });
      router.push(`/vendors/${vendor.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="New vendor" subtitle="Only Buyer and Admin can create vendors." />
      {error && <ErrorBanner message={error} />}
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Legal name">
            <Input required value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Acme Supplies Pvt Ltd" />
          </Field>
          <Field label="GSTIN (optional)">
            <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="29ABCDE1234F1Z5" />
          </Field>
          <Field label="Payment terms (days)">
            <Input type="number" min={0} value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
          </Field>

          <div className="border-t border-stone-200 pt-4 dark:border-stone-800">
            <p className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-300">Primary contact (optional)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Name">
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </Field>
            </div>
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create vendor'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
