import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Deliberately unguarded — this is the one endpoint that has to be
  // reachable before a session exists. Much stricter than the app-wide
  // default throttle (see app.module.ts) since this is the one endpoint a
  // brute-force credential-guessing attempt would actually hit.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
