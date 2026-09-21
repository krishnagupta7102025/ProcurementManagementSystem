import { IsString, MinLength } from 'class-validator';

export class UploadInvoiceFileDto {
  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsString()
  @MinLength(1)
  contentType!: string;

  // Raw base64 payload, no "data:...;base64," prefix — see the identical
  // note on RequisitionAttachment's UploadAttachmentDto.
  @IsString()
  @MinLength(1)
  base64Content!: string;
}
