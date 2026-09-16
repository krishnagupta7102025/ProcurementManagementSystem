/**
 * The exact Losung360 platform notification-center API contract is
 * unconfirmed (see docs/00-prd.md §11 / ticket P2P-006 AC) — this shape is
 * a reasonable placeholder, not a verified integration. Confirm with the
 * platform team before implementing a real NotificationService against it;
 * every call site in the app should only ever depend on this interface.
 */
export interface NotificationPayload {
  orgId: string;
  recipientUserId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationService {
  send(payload: NotificationPayload): Promise<void>;
}

export const NOTIFICATION_SERVICE = Symbol('NOTIFICATION_SERVICE');
