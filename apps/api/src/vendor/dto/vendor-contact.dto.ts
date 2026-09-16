import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class VendorContactDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
