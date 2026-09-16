import { Injectable, Logger } from '@nestjs/common';
import type { NotificationPayload, NotificationService } from './notification.interface.js';

/** Dev/test stand-in — logs instead of calling the real notification center. */
@Injectable()
export class StubNotificationService implements NotificationService {
  private readonly logger = new Logger(StubNotificationService.name);

  async send(payload: NotificationPayload): Promise<void> {
    this.logger.log(
      `[stub notification] ${payload.type} -> user ${payload.recipientUserId}: ${payload.title}`,
    );
  }
}
