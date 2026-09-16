import { IsEnum } from 'class-validator';
import { VendorStatus } from '../../generated/prisma/enums.js';

export class UpdateVendorStatusDto {
  @IsEnum(VendorStatus)
  status!: VendorStatus;
}
