'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { EmptyState } from './ui';

function InnerIdParam({ children }: { children: (id: string) => ReactNode }) {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  if (!id) return <EmptyState>Missing ?id= in the URL.</EmptyState>;
  return <>{children(id)}</>;
}

/**
 * Reads `?id=` from the URL and renders `children(id)`. Used by every
 * "detail" page instead of a Next.js dynamic route segment (`[id]`), since
 * static export (this app's GitHub Pages build) can't pre-render an
 * unbounded set of runtime database IDs as separate HTML files the way a
 * dynamic segment would need — a query param is just one static page.
 * useSearchParams() requires a Suspense boundary during static export,
 * hence the wrapper here rather than calling it directly in each page.
 */
export function WithIdParam({ children }: { children: (id: string) => ReactNode }) {
  return (
    <Suspense fallback={null}>
      <InnerIdParam>{children}</InnerIdParam>
    </Suspense>
  );
}
