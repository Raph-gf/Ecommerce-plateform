import {
  Injectable,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { hash, compare } from 'bcryptjs';
import { Role } from '../../../generated/prisma/enums.js';
import { User } from '../../../generated/prisma/client.js';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    return (await hash(password, SALT_ROUNDS)) as string;
  }

  private async comparePassword(
    password: string,
    password_hash: string,
  ): Promise<boolean> {
    return (await compare(password, password_hash)) as boolean;
  }

  private async generateAccessToken(
    userId: string,
    email: string,
    role: Role,
  ): Promise<string> {
    return await this.jwtService.signAsync({
      sub: userId,
      email: email,
      role: role,
    });
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const refresh_token = await this.jwtService.signAsync(
      {
        sub: userId,
      },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN'),
      },
    );
    return refresh_token;
  }

  private async saveRefreshToken(
    userId: string,
    refresh_token: string,
  ): Promise<void> {
    const token_hash = (await hash(refresh_token, SALT_ROUNDS)) as string;

    await this.prisma.refreshToken.create({
      data: {
        user_id: userId,
        token_hash,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
      },
    });
  }

  private async deleteRefreshToken(
    userId: string,
    refresh_token: string,
  ): Promise<User> {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        include: {
          refresh_tokens: true,
        },
      });

      if (!user) {
        throw new HttpException(
          'Invalid refresh token',
          HttpStatus.UNAUTHORIZED,
        );
      }

      let token_found = false;

      for (const tokens of user.refresh_tokens) {
        const userTokens = await compare(refresh_token, tokens.token_hash);
        if (userTokens) {
          await this.prisma.refreshToken.delete({ where: { id: tokens.id } });
          token_found = true;
          break;
        }
      }
      if (!token_found) {
        throw new HttpException(
          'Invalid refresh token',
          HttpStatus.UNAUTHORIZED,
        );
      }
      return user;
    } catch (error) {
      console.error(error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to delete refresh token');
    }
  }

  async register(
    email: string,
    password: string,
    first_name: string,
    last_name: string,
  ): Promise<{
    access_token: string;
    refresh_token: string;
    user: Omit<User, 'password_hash'>;
  }> {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          email,
        },
      });
      if (existingUser) {
        throw new HttpException('Email already exists', HttpStatus.CONFLICT);
      }

      const password_hash = await this.hashPassword(password);

      const user = await this.prisma.user.create({
        data: {
          email,
          first_name,
          password_hash,
          last_name,
          role: Role.CUSTOMER,
        },
        omit: { password_hash: true },
      });

      const access_token = await this.generateAccessToken(
        user.id,
        email,
        Role.CUSTOMER,
      );
      const refresh_token = await this.generateRefreshToken(user.id);

      await this.saveRefreshToken(user.id, refresh_token);

      return { user, access_token, refresh_token };
    } catch (error) {
      console.error(error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to register user');
    }
  }

  async signIn(
    email: string,
    password: string,
  ): Promise<{
    access_token: string;
    refresh_token: string;
    user: Omit<User, 'password_hash'>;
  }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

      if (!user) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      if (user.password_hash === null) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      const isPasswordValid = await this.comparePassword(
        password,
        user.password_hash ?? '',
      );

      if (!isPasswordValid) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      const access_token = await this.generateAccessToken(
        user.id,
        user.email,
        user.role,
      );

      const refresh_token = await this.generateRefreshToken(user.id);
      await this.saveRefreshToken(user.id, refresh_token);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash: _, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword as Omit<User, 'password_hash'>,
        access_token,
        refresh_token,
      };
    } catch (error) {
      console.error(error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to sign in');
    }
  }

  async signOut(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: {
        user_id: userId,
      },
    });
  }

  async refresh(refresh_token: string): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    try {
      const decoded = await this.jwtService.verifyAsync(refresh_token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.deleteRefreshToken(
        decoded.sub as string,
        refresh_token,
      );

      const access_token = await this.generateAccessToken(
        user.id,
        user.email,
        user.role,
      );

      const new_refresh_token = await this.generateRefreshToken(user.id);

      await this.saveRefreshToken(user.id, new_refresh_token);

      return { access_token, refresh_token: new_refresh_token };
    } catch (error) {
      console.error(error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to refresh token');
    }
  }
}
