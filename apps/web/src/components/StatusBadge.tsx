const GREEN = new Set(['APPROVED', 'ISSUED', 'FULLY_RECEIVED', 'PAID', 'RELEASED', 'ACTIVE', 'RESOLVED', 'APPROVED_FOR_PAYMENT', 'MATCHED']);
const AMBER = new Set(['PENDING', 'PENDING_APPROVAL', 'SUBMITTED', 'PARTIALLY_RECEIVED', 'ON_HOLD', 'OPEN']);
const RED = new Set(['REJECTED', 'CANCELLED', 'BLACKLISTED', 'MATCH_EXCEPTION', 'VOID']);

function colorFor(status: string): string {
  if (GREEN.has(status)) return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (AMBER.has(status)) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  if (RED.has(status)) return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorFor(status)}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
