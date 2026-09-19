import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InvoiceLineDto } from './invoice-line.dto.js';

export class CreateInvoiceDto {
  @IsString()
  @MinLength(1)
  vendorId!: string;

  @IsString()
  @MinLength(1)
  invoiceNumber!: string;

  @IsISO8601()
  invoiceDate!: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsInt()
  @Min(0)
  taxMinorUnits!: number;

  // A draft may transiently have zero lines while being entered — "must
  // link to at least one PO before submission" (P2P-050 AC) is enforced in
  // InvoiceService.submit(), not here (same pattern as RequisitionService).
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}
