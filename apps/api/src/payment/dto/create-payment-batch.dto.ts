import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { PaymentBatchLineDto } from './payment-batch-line.dto.js';

export class CreatePaymentBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentBatchLineDto)
  lines!: PaymentBatchLineDto[];
}
