import { Test, TestingModule } from '@nestjs/testing';
import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
} from '@jest/globals';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { hash } from 'bcryptjs';

const SALT_ROUNDS = 10;

describe('AuthService', () => {
  let service: AuthService;
  let hashPassword: string;
  let tokenHash: string;

  beforeAll(async () => {
    hashPassword = await hash('Password1!', SALT_ROUNDS);
    tokenHash = await hash('test_raw_token', SALT_ROUNDS);
  });

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('register should return access_token, refresh_token and user', async () => {
    (mockPrismaService.user.findUnique as any).mockResolvedValue(null);
    (mockPrismaService.user.create as any).mockResolvedValue({
      id: '123',
      email: 'test@test.com',
    });

    (mockConfigService.get as any).mockResolvedValueOnce('password');
    (mockJwtService.signAsync as any).mockResolvedValueOnce(
      'test_access_token',
    );
    (mockJwtService.signAsync as any).mockResolvedValueOnce(
      'test_refresh_token',
    );
    const result = await service.register(
      'test@test.com',
      'Password1!',
      'Test',
      'User',
    );
    expect(result).toEqual({
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
      user: { id: '123', email: 'test@test.com' },
    });
  });

  it('register should throw an error if the email already exists', async () => {
    (mockPrismaService.user.findUnique as any).mockResolvedValue({
      id: '123',
      email: 'test@test.com',
    });
    await expect(
      service.register('test@test.com', 'Password1!', 'Test', 'User'),
    ).rejects.toThrow(HttpException);
  });

  it('signIn should return the user and the access_token and refresh_token', async () => {
    (mockPrismaService.user.findUnique as any).mockResolvedValue({
      id: '123',
      email: 'test@test.com',
      password_hash: hashPassword,
    });
    (mockJwtService.signAsync as any).mockResolvedValueOnce(
      'test_access_token',
    );
    (mockJwtService.signAsync as any).mockResolvedValueOnce(
      'test_refresh_token',
    );
    const result = await service.signIn('test@test.com', 'Password1!');
    expect(result).toEqual({
      user: {
        id: '123',
        email: 'test@test.com',
      },
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
    });
  });

  it('signIn should throw 401 if user not found', async () => {
    (mockPrismaService.user.findUnique as any).mockResolvedValue(null);
    await expect(
      service.signIn('wrong@test.com', 'Password1!'),
    ).rejects.toThrow(HttpException);
  });

  it('signIn should throw 401 if user has no password hash (OAuth user)', async () => {
    (mockPrismaService.user.findUnique as any).mockResolvedValue({
      id: '123',
      email: 'wrong@test.com',
      password_hash: null,
    });
    await expect(
      service.signIn('wrong@test.com', 'Password1!'),
    ).rejects.toThrow(HttpException);
  });

  it('signIn should return an error 401 if the password is wrong', async () => {
    (mockPrismaService.user.findUnique as any).mockResolvedValue({
      id: '123',
      email: 'test@test.com',
      password_hash: hashPassword,
    });
    await expect(service.signIn('test@test.com', 'Password2!')).rejects.toThrow(
      HttpException,
    );
  });

  it('signOut should delete the refresh_token for the user', async () => {
    (mockPrismaService.refreshToken.deleteMany as any).mockResolvedValue({
      id: '123',
      user_id: '123',
      token_hash: hashPassword,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    });
    await service.signOut('123');
    expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { user_id: '123' },
    });
  });

  it('refresh should return the access_token and refresh_token', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValue({
      sub: '123',
    });
    (mockPrismaService.user.findUnique as any).mockResolvedValue({
      id: '123',
      email: 'test@test.com',
      refresh_tokens: [
        {
          id: '12',
          user_id: '123',
          token_hash: tokenHash,
        },
      ],
    });
    (mockJwtService.signAsync as any).mockResolvedValueOnce(
      'test_access_token',
    );
    (mockJwtService.signAsync as any).mockResolvedValueOnce(
      'test_refresh_token',
    );
    const result = await service.refresh('test_raw_token');
    expect(result).toEqual({
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
    });
  });

  it('refresh should throw an error if the refresh_token is invalid', async () => {
    (mockJwtService.verifyAsync as any).mockRejectedValue(
      new Error('Invalid refresh token'),
    );
    await expect(service.refresh('invalid_refresh_token')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('should get the user profile', async () => {
    (mockPrismaService.user.findUnique as any).mockResolvedValue({
      id: '123',
      email: 'test@test.com',
      role: 'user',
    });
    const result = await service.getUserProfile('123');
    expect(result).toEqual({ id: '123', email: 'test@test.com', role: 'user' });
  });

  it('should throw an error if the user is not found', async () => {
    (mockPrismaService.user.findUnique as any).mockResolvedValue(null);
    await expect(service.getUserProfile('123')).rejects.toThrow(HttpException);
  });
});
