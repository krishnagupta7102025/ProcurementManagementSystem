// Mirrors apps/api/prisma/seed.ts exactly — these are the only accounts
// that exist after running `pnpm --filter api run db:seed`.
export interface DemoUser {
  email: string;
  label: string;
  role: string;
}

export const DEMO_USERS: DemoUser[] = [
  { email: 'requester@demo.p2p', label: 'Rita Requester', role: 'REQUESTER' },
  { email: 'approver@demo.p2p', label: 'Alan Approver', role: 'APPROVER' },
  { email: 'buyer@demo.p2p', label: 'Bella Buyer', role: 'BUYER' },
  { email: 'receiver@demo.p2p', label: 'Ravi Receiver', role: 'RECEIVER' },
  { email: 'ap@demo.p2p', label: 'Amy AP', role: 'AP' },
  { email: 'controller@demo.p2p', label: 'Carl Controller', role: 'CONTROLLER' },
  { email: 'admin@demo.p2p', label: 'Ada Admin', role: 'ADMIN' },
];
