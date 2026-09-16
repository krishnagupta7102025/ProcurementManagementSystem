import type { Role } from '../generated/prisma/enums.js';

/** The authenticated principal attached to `req.user` by OidcAuthGuard. */
export interface AuthenticatedUser {
  /** Subject claim from Central Login — maps to User.centralLoginId. */
  centralLoginId: string;
  orgId: string;
  email: string;
  roles: Role[];
}
