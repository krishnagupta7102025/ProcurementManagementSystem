import { IsOptional, IsString, MinLength } from 'class-validator';

export class ConfirmServiceDto {
  @IsString()
  @MinLength(1)
  poLineId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
