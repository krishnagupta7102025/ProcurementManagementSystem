import { PartialType } from '@nestjs/mapped-types';
import { CreateApprovalRuleDto } from './create-approval-rule.dto.js';

export class UpdateApprovalRuleDto extends PartialType(CreateApprovalRuleDto) {}
