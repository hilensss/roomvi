import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthService } from '../dist/modules/auth/auth.service.js';
import { LoginDto } from '../dist/modules/auth/dto/login.dto.js';
import { RegisterDto } from '../dist/modules/auth/dto/register.dto.js';
import { UsersService } from '../dist/modules/users/users.service.js';

const validationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

function transform(metatype, value) {
  return validationPipe.transform(value, { type: 'body', metatype });
}

test('auth DTOs normalize emails and enforce the shared password contract', async () => {
  const registration = await transform(RegisterDto, {
    email: '  USER@Example.COM ',
    password: '12345678',
    name: '  Ada  ',
    phone: '  +995 555 123 456  ',
  });

  assert.deepEqual({ ...registration }, {
    email: 'user@example.com',
    password: '12345678',
    name: 'Ada',
    phone: '+995 555 123 456',
  });

  const login = await transform(LoginDto, {
    email: ' USER@Example.COM ',
    password: '12345678',
  });
  assert.equal(login.email, 'user@example.com');

  for (const input of [
    { email: 'user@example.com', password: '1234567' },
    { email: 'user@example.com', password: 'x'.repeat(73) },
    {
      email: 'user@example.com',
      password: '12345678',
      name: 'x'.repeat(101),
    },
    {
      email: 'user@example.com',
      password: '12345678',
      phone: '1'.repeat(33),
    },
  ]) {
    await assert.rejects(
      transform(RegisterDto, input),
      (error) => error instanceof BadRequestException,
    );
  }
});

test('registration maps a concurrent unique-email race to a stable conflict', async () => {
  const prisma = {
    user: {
      findUnique: async () => null,
      create: async () => {
        throw { code: 'P2002' };
      },
    },
  };

  await assert.rejects(
    new UsersService(prisma).create({
      email: 'user@example.com',
      passwordHash: 'hash',
    }),
    (error) => error instanceof ConflictException,
  );
});

function createAuthService({ updateCount = 1 } = {}) {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'password-hash',
    name: 'Ada',
    phone: null,
    role: 'USER',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const calls = [];
  const tx = {
    refreshToken: {
      updateMany: async (args) => {
        calls.push(['updateMany', args]);
        return { count: updateCount };
      },
      create: async (args) => {
        calls.push(['create', args]);
        return args.data;
      },
    },
  };
  const prisma = {
    refreshToken: {
      findUnique: async () => ({
        id: 'session-1',
        jti: 'old-jti',
        tokenHash: '',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user,
      }),
    },
    $transaction: async (operation) => operation(tx),
  };
  const config = {
    get: (key) =>
      ({
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        REFRESH_TOKEN_TTL_DAYS: '30',
      })[key],
  };
  const jwt = {
    verifyAsync: async () => ({ sub: user.id, jti: 'old-jti' }),
    signAsync: async (payload) =>
      'jti' in payload ? 'new-refresh-token' : 'new-access-token',
  };

  return {
    calls,
    prisma,
    service: new AuthService(config, jwt, {}, prisma),
  };
}

test('auth configuration fails at startup when the refresh secret is missing', () => {
  assert.throws(
    () =>
      new AuthService(
        {
          get: (key) =>
            key === 'JWT_ACCESS_SECRET' ? 'access-secret' : undefined,
        },
        {},
        {},
        {},
      ),
    /JWT_REFRESH_SECRET is not set/,
  );
});

test('refresh rotation revokes with compare-and-set and creates the successor in one transaction', async () => {
  const { calls, prisma, service } = createAuthService();
  prisma.refreshToken.findUnique = async () => ({
    id: 'session-1',
    jti: 'old-jti',
    tokenHash: await bcrypt.hash('old-refresh-token', 4),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: 'password-hash',
      name: 'Ada',
      phone: null,
      role: 'USER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  const result = await service.refreshByToken('old-refresh-token');

  assert.deepEqual(result.tokens, {
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
  });
  assert.equal(calls[0][0], 'updateMany');
  assert.deepEqual(calls[0][1].where, {
    id: 'session-1',
    revokedAt: null,
    expiresAt: { gt: calls[0][1].data.revokedAt },
  });
  assert.equal(calls[1][0], 'create');
  assert.equal(calls[1][1].data.userId, 'user-1');
  assert.equal(calls[1][1].data.tokenHash.startsWith('$2b$'), true);
});

test('a concurrent refresh loser cannot create a second successor token', async () => {
  const { calls, prisma, service } = createAuthService({ updateCount: 0 });
  prisma.refreshToken.findUnique = async () => ({
    id: 'session-1',
    jti: 'old-jti',
    tokenHash: await bcrypt.hash('old-refresh-token', 4),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: 'password-hash',
      name: 'Ada',
      phone: null,
      role: 'USER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  await assert.rejects(
    service.refreshByToken('old-refresh-token'),
    (error) => error instanceof UnauthorizedException,
  );
  assert.deepEqual(
    calls.map(([name]) => name),
    ['updateMany'],
  );
});
