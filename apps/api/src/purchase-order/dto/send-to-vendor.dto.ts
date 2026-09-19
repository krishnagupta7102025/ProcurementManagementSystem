import { IsString, MinLength } from 'class-validator';

export class SendToVendorDto {
  @IsString()
  @MinLength(1)
  message!: string;
}
