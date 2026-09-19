import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GRNLineDto } from './grn-line.dto.js';

export class CreateGoodsReceiptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GRNLineDto)
  lines!: GRNLineDto[];

  @IsOptional()
  @IsISO8601()
  receivedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Required only when a line's cumulative receipt would exceed its PO
  // line's ordered quantity beyond tolerance (P2P-040 AC) — checked in the
  // service, and only a Buyer/Admin actor may supply it.
  @IsOptional()
  @IsString()
  @MinLength(1)
  overrideReason?: string;
}
