import type { Role } from '../generated/prisma/enums.js';

/** The authenticated principal attached to `req.user` by AuthGuard, decoded straight from the verified JWT. */
export interface AuthenticatedUser {
  /** The local User.id — every FK (requester, approver, actor) in the app references this. */
  localUserId: string;
  orgId: string;
  email: string;
  displayName: string;
  roles: Role[];
}
