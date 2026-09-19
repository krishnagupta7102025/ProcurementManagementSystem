import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { POLineAllocationDto } from './po-line-allocation.dto.js';

export class POLineDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @MinLength(1)
  unit!: string;

  @IsInt()
  @Min(0)
  unitPriceMinorUnits!: number;

  // Every PO line must trace back to at least one requisition line
  // (P2P-030 AC) — enforced structurally by requiring a non-empty array,
  // not just checked after the fact.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => POLineAllocationDto)
  allocations!: POLineAllocationDto[];
}
