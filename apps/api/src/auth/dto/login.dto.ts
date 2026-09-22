import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  // require_tld: false — see the identical note on CreateUserDto; this
  // project's own seeded accounts use the @demo.p2p domain, whose TLD
  // contains a digit and fails class-validator's default IsEmail regex.
  @IsEmail({ require_tld: false })
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
