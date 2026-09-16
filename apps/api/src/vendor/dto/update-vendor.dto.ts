import { PartialType } from '@nestjs/mapped-types';
import { CreateVendorDto } from './create-vendor.dto.js';

// Status changes go through the dedicated updateStatus() action/endpoint
// instead, so they're audited as an explicit lifecycle transition rather
// than folded into a generic field update.
export class UpdateVendorDto extends PartialType(CreateVendorDto) {}
