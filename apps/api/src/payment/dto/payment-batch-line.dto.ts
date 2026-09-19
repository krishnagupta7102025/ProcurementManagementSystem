import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class PaymentBatchLineDto {
  @IsString()
  @MinLength(1)
  invoiceId!: string;

  @IsInt()
  @Min(1)
  amountMinorUnits!: number;
}
