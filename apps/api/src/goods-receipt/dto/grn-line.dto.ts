import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class GRNLineDto {
  @IsString()
  @MinLength(1)
  poLineId!: string;

  @IsInt()
  @Min(1)
  quantityReceived!: number;

  @IsOptional()
  @IsString()
  conditionNotes?: string;
}
