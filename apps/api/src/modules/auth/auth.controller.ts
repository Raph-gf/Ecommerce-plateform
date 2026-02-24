import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto.js';
import { AuthService } from './auth.service.js';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto.js';
import { ResponseMessage } from '../../common/decorator/response-message.decorator.js';
import { User } from '../../../generated/prisma/client.js';
import { Public } from '../../common/decorator/public.decorator.js';
import { CurrentUser } from '../../common/decorator/current-user-decorator.js';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Public()
  @Throttle({ short: { ttl: 300_000, limit: 10 } })
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
  @Throttle({ short: { ttl: 300_000, limit: 10 } })
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

  @Post('logout')
  @ResponseMessage('User logged out successfully')
  async logout(
    @CurrentUser('userId') userId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.signOut(userId);
    response.clearCookie('refresh_token');
  }

  @Post('refresh')
  @Public()
  @ResponseMessage('Token refreshed successfully')
  async refresh(
    @Res({ passthrough: true }) response: Response,
    @Req()
    request: Request,
  ): Promise<{ access_token: string }> {
    if (
      !request.cookies['refresh_token'] ||
      request.cookies['refresh_token'] === ''
    ) {
      throw new HttpException('No refresh token', HttpStatus.UNAUTHORIZED);
    }
    const { access_token, refresh_token } = await this.authService.refresh(
      request.cookies.refresh_token as string,
    );
    response.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    return { access_token };
  }

  @Get('profile/me')
  @ResponseMessage('User profile fetched successfully')
  async getUserProfile(
    @CurrentUser('userId') userId: string,
  ): Promise<Omit<User, 'password_hash'>> {
    return await this.authService.getUserProfile(userId);
  }
}
