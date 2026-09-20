import { ArrayMinSize, IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';

export class CreateUserDto {
  // require_tld: false — class-validator's default email regex rejects any
  // TLD containing a digit, which would reject every address on this
  // project's own @demo.p2p domain (seeded users bypass this DTO entirely,
  // so the mismatch was invisible until admin-created users hit it too).
  @IsEmail({ require_tld: false })
  email!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(Role, { each: true })
  roles!: Role[];

  @IsOptional()
  @IsString()
  managerId?: string;
}
