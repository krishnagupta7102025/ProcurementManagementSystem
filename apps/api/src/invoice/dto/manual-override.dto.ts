import { IsString, MinLength } from 'class-validator';

export class ManualOverrideDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
