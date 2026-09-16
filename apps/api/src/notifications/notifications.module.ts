import { Module } from '@nestjs/common';
import { NOTIFICATION_SERVICE } from './notification.interface.js';
import { StubNotificationService } from './stub-notification.service.js';

@Module({
  providers: [{ provide: NOTIFICATION_SERVICE, useClass: StubNotificationService }],
  exports: [NOTIFICATION_SERVICE],
})
export class NotificationsModule {}
