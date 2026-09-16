import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApprovalRuleStepDto } from './approval-rule-step.dto.js';

export class CreateApprovalRuleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  // Omit/null = matches any department / any cost center (wildcard).
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minAmountMinorUnits?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxAmountMinorUnits?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApprovalRuleStepDto)
  steps!: ApprovalRuleStepDto[];
}
