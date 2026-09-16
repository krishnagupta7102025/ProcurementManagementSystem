// Mirrors the `Role` enum in apps/api/prisma/schema.prisma. Kept as a plain
// literal union (not generated) so the web app doesn't need to depend on
// the API's generated Prisma client — update both places together.
export const ROLES = [
  'REQUESTER',
  'APPROVER',
  'BUYER',
  'RECEIVER',
  'AP',
  'CONTROLLER',
  'ADMIN',
] as const;

export type Role = (typeof ROLES)[number];
