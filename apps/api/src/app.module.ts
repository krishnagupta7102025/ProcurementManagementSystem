import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ApprovalModule } from './approval/approval.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EmailModule } from './email/email.module.js';
import { GoodsReceiptModule } from './goods-receipt/goods-receipt.module.js';
import { InvoiceModule } from './invoice/invoice.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PaymentModule } from './payment/payment.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PurchaseOrderModule } from './purchase-order/purchase-order.module.js';
import { RequisitionModule } from './requisition/requisition.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UserModule } from './user/user.module.js';
import { VendorModule } from './vendor/vendor.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({ connection: { url: process.env.REDIS_URL } }),
    PrismaModule,
    UserModule,
    AuthModule,
    AuditModule,
    StorageModule,
    EmailModule,
    NotificationsModule,
    VendorModule,
    ApprovalModule,
    RequisitionModule,
    PurchaseOrderModule,
    GoodsReceiptModule,
    InvoiceModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
