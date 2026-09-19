/**
 * Outbound email to an external party (vendors, so far) — distinct from
 * NotificationService, which is the internal Losung360 platform
 * notification center for Losung360 users. No SMTP/email provider is
 * configured yet, so this is a stubbed integration point: the interface is
 * real and used by real call sites, but StubEmailService only logs.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  /** S3 key of an attachment already uploaded via StorageService, if any. */
  attachmentS3Key?: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
