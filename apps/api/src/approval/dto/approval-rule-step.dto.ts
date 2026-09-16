import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class ApprovalRuleStepDto {
  @IsInt()
  @Min(1)
  stepOrder!: number;

  @IsString()
  @MinLength(1)
  approverUserId!: string;
}
