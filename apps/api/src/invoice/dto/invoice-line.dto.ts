import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class InvoiceLineDto {
  @IsString()
  @MinLength(1)
  poLineId!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsInt()
  @Min(0)
  unitPriceMinorUnits!: number;
}
