import { IsOptional, IsString, MinLength } from 'class-validator';

export class ApprovalActionDto {
  // Required for reject/request-changes (validated in the service, since
  // "required only for some actions" isn't expressible with a single
  // class-validator decorator here); optional for approve.
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}
