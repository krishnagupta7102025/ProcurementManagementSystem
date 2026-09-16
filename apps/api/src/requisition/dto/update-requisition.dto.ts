import { PartialType } from '@nestjs/mapped-types';
import { CreateRequisitionDto } from './create-requisition.dto.js';

// Only valid while the requisition is still DRAFT — RequisitionService
// enforces that, not this DTO.
export class UpdateRequisitionDto extends PartialType(CreateRequisitionDto) {}
