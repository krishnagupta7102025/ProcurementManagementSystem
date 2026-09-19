import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { InvoiceLineDto } from './invoice-line.dto.js';

export class AdjustAndRematchDto {
  // Replaces the invoice's line set wholesale, then re-runs matching.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}
