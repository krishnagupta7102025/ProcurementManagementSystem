import { PartialType } from '@nestjs/mapped-types';
import { CreateInvoiceDto } from './create-invoice.dto.js';

// Only valid while the invoice is still DRAFT — InvoiceService enforces
// that, not this DTO.
export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}
