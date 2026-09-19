import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailService } from './email.interface.js';

/** Dev/test stand-in — logs instead of sending through a real SMTP/email provider. */
@Injectable()
export class StubEmailService implements EmailService {
  private readonly logger = new Logger(StubEmailService.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(
      `[stub email] -> ${message.to}: ${message.subject}${message.attachmentS3Key ? ` (attachment: ${message.attachmentS3Key})` : ''}`,
    );
  }
}
