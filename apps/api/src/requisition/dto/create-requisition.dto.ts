import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RequisitionLineDto } from './requisition-line.dto.js';

export class CreateRequisitionDto {
  @IsString()
  @MinLength(1)
  costCenterId!: string;

  @IsString()
  @MinLength(1)
  department!: string;

  @IsOptional()
  @IsISO8601()
  neededByDate?: string;

  @IsOptional()
  @IsString()
  justification?: string;

  // A draft may transiently have zero lines while being edited — the
  // zero-line block (P2P-020 AC) is enforced in RequisitionService.submit(),
  // not here.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineDto)
  lines!: RequisitionLineDto[];
}
