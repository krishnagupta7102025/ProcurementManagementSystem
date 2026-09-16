import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class RequisitionLineDto {
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
  estimatedUnitPriceMinorUnits!: number;
}
