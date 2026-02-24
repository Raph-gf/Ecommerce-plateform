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
import { HttpException } from '@nestjs/common';
import { hash } from 'bcryptjs';

const SALT_ROUNDS = 10;

describe('AuthService', () => {
  let service: AuthService;
  let hashPassword: string;

  beforeAll(async () => {
    hashPassword = await hash('Password1!', SALT_ROUNDS);
  });

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
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
});
