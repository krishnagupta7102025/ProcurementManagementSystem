import { IsISO8601, IsString, MinLength } from 'class-validator';

export class ReleasePaymentBatchDto {
  @IsString()
  @MinLength(1)
  method!: string;

  @IsString()
  @MinLength(1)
  referenceNumber!: string;

  @IsISO8601()
  paymentDate!: string;
}
