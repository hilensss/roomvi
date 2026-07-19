import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';

const { ManagerGuard } = await import(
  '../dist/modules/b2b-projects/guards/manager.guard.js'
);
const { CreateB2BProjectDto } = await import(
  '../dist/modules/b2b-projects/dto/create-b2b-project.dto.js'
);
const { ReplaceB2BProjectProductsDto } = await import(
  '../dist/modules/b2b-projects/dto/replace-b2b-project-products.dto.js'
);

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

function transform(metatype, value) {
  return pipe.transform(value, { type: 'body', metatype });
}

function contextFor(user) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
}

test('ManagerGuard accepts MANAGER and ADMIN and rejects USER or missing authentication', () => {
  const guard = new ManagerGuard();

  for (const role of ['MANAGER', 'ADMIN']) {
    assert.equal(
      guard.canActivate(contextFor({ userId: `${role.toLowerCase()}-1`, role })),
      true,
    );
  }

  for (const user of [{ userId: 'user-1', role: 'USER' }, undefined]) {
    assert.throws(
      () => guard.canActivate(contextFor(user)),
      (error) => error instanceof ForbiddenException,
    );
  }
});

test('CreateB2BProjectDto accepts the furniture project fields and rejects invalid enums or unknown input', async () => {
  const dto = await transform(CreateB2BProjectDto, {
    name: 'Новая линейка',
    partnerName: 'Мебельный дом',
    supplierId: '4f06c408-13ee-4e77-8a78-68ca8d8501d2',
    roomType: 'LIVING_ROOM',
    style: 'SCANDI',
    managerComment: 'Светлая сцена',
  });

  assert.equal(dto.name, 'Новая линейка');
  assert.equal(dto.roomType, 'LIVING_ROOM');

  for (const input of [
    {
      name: '',
      partnerName: 'Партнёр',
      supplierId: 'not-a-uuid',
      roomType: 'GARAGE',
      style: 'SCANDI',
    },
    {
      name: 'Проект',
      partnerName: 'Партнёр',
      supplierId: '4f06c408-13ee-4e77-8a78-68ca8d8501d2',
      roomType: 'LIVING_ROOM',
      style: 'SCANDI',
      unexpected: true,
    },
  ]) {
    await assert.rejects(
      transform(CreateB2BProjectDto, input),
      (error) => error instanceof BadRequestException,
    );
  }
});

test('ReplaceB2BProjectProductsDto requires 1–6 unique product ids', async () => {
  const ids = [
    '2c11ad6d-7a82-4928-b3e9-b7e888d6517b',
    '9c338e7d-3d61-42ae-b986-a12340b58dca',
  ];

  assert.deepEqual(
    (await transform(ReplaceB2BProjectProductsDto, { productIds: ids }))
      .productIds,
    ids,
  );

  for (const productIds of [
    [],
    [...ids, ids[0]],
    Array.from(
      { length: 7 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    ),
  ]) {
    await assert.rejects(
      transform(ReplaceB2BProjectProductsDto, { productIds }),
      (error) => error instanceof BadRequestException,
    );
  }
});
