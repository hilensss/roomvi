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
    sourceImageUrl: 'https://cdn.example.com/empty-room.jpg',
  });

  assert.equal(dto.name, 'Новая линейка');
  assert.equal(dto.roomType, 'LIVING_ROOM');
  assert.equal(
    dto.sourceImageUrl,
    'https://cdn.example.com/empty-room.jpg',
  );

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
      sourceImageUrl: 'not-a-url',
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

test('CreateB2BProjectDto accepts developer projects without furniture-only fields', async () => {
  const dto = await transform(CreateB2BProjectDto, {
    type: 'DEVELOPER_FLOOR_PLAN',
    name: 'Квартира 12',
    partnerName: 'Новый девелопер',
    style: 'MODERN',
    sourceImageUrl: 'https://cdn.example.com/floor-plan.jpg',
    defaultCeilingHeightCm: 285,
  });

  assert.equal(dto.type, 'DEVELOPER_FLOOR_PLAN');
  assert.equal(dto.supplierId, undefined);
  assert.equal(dto.roomType, undefined);
  assert.equal(dto.defaultCeilingHeightCm, 285);

  await assert.rejects(
    transform(CreateB2BProjectDto, {
      type: 'DEVELOPER_FLOOR_PLAN',
      name: 'Квартира 12',
      partnerName: 'Новый девелопер',
      style: 'MODERN',
    }),
    (error) => error instanceof BadRequestException,
  );
});

test('ReplaceB2BProjectProductsDto requires 1–10 unique product ids', async () => {
  const ids = Array.from(
    { length: 10 },
    (_, index) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );

  assert.deepEqual(
    (await transform(ReplaceB2BProjectProductsDto, { productIds: ids }))
      .productIds,
    ids,
  );

  for (const productIds of [
    [],
    [...ids, ids[0]],
    Array.from(
      { length: 11 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    ),
  ]) {
    await assert.rejects(
      transform(ReplaceB2BProjectProductsDto, { productIds }),
      (error) => error instanceof BadRequestException,
    );
  }
});
