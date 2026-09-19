import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { POLineDto } from './po-line.dto.js';

export class CreatePurchaseOrderDto {
  @IsString()
  @MinLength(1)
  vendorId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => POLineDto)
  lines!: POLineDto[];

  @IsOptional()
  @IsISO8601()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  billToAddress?: string;

  @IsOptional()
  @IsString()
  shipToAddress?: string;

  // Lets a Buyer knowingly order more of a line than any linked
  // requisition actually asked for (P2P-030 AC allows this only as an
  // explicit override, never silently).
  @IsOptional()
  @IsBoolean()
  overrideQuantityCheck?: boolean;
}
