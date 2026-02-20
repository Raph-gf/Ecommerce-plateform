import { Body, Controller, Post, Res } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto.js';
import { AuthService } from './auth.service.js';
import type { Response } from 'express';
import { LoginDto } from './dto/login.dto.js';
import { ResponseMessage } from '../../common/decorator/response-message.decorator.js';
import { User } from '../../../generated/prisma/client.js';
import { Public } from '../../common/decorator/public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Public()
  @Post('register')
  @ResponseMessage('User registered successfully')
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true })
    response: Response,
  ): Promise<{ user: Omit<User, 'password_hash'>; access_token: string }> {
    const { refresh_token, access_token, user } =
      await this.authService.register(
        registerDto.email,
        registerDto.password,
        registerDto.first_name,
        registerDto.last_name,
      );
    response.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    return { user, access_token };
  }
  @Public()
  @Post('login')
  @ResponseMessage('User logged in successfully')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: Omit<User, 'password_hash'>; access_token: string }> {
    const { refresh_token, access_token, user } = await this.authService.signIn(
      loginDto.email,
      loginDto.password,
    );
    response.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    return { user, access_token };
  }
}
