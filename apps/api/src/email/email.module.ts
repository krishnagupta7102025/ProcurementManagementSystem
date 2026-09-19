import { Module } from '@nestjs/common';
import { EMAIL_SERVICE } from './email.interface.js';
import { StubEmailService } from './stub-email.service.js';

@Module({
  providers: [{ provide: EMAIL_SERVICE, useClass: StubEmailService }],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
