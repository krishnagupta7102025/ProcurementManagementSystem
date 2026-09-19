import { IsString, MinLength } from 'class-validator';

export class ReconcileBankStatementDto {
  @IsString()
  @MinLength(1)
  paymentBatchId!: string;
}
