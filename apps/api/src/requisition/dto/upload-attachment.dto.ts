import { IsString, MinLength } from 'class-validator';

export class UploadAttachmentDto {
  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsString()
  @MinLength(1)
  contentType!: string;

  // Raw base64 payload, no "data:...;base64," prefix — kept as a plain
  // JSON field rather than multipart/form-data so this reuses the same
  // StorageService.putObject() path as PO PDF generation, with no new
  // upload-parsing dependency for what's a Phase-0-scale file size.
  @IsString()
  @MinLength(1)
  base64Content!: string;
}
