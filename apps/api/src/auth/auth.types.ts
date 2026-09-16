import type { Role } from '../generated/prisma/enums.js';

/** The authenticated principal attached to `req.user` by OidcAuthGuard. */
export interface AuthenticatedUser {
  /**
   * The local User.id — this is what every FK (requester, approver, actor)
   * in the app should reference, never centralLoginId directly.
   */
  localUserId: string;
  /** Subject claim from Central Login — maps to User.centralLoginId. */
  centralLoginId: string;
  orgId: string;
  email: string;
  displayName: string;
  roles: Role[];
}
