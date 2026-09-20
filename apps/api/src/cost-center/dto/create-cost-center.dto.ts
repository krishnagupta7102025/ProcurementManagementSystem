import { IsString, MinLength } from 'class-validator';

export class CreateCostCenterDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  department!: string;
}
