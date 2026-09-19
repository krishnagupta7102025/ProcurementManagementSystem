import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class POLineAllocationDto {
  @IsString()
  @MinLength(1)
  requisitionLineId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
