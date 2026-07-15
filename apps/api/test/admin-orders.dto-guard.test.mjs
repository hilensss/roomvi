import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';

const { AdminOrdersQueryDto } = await import(
  '../dist/modules/admin/dto/admin-orders-query.dto.js'
);
const { AdminGuard } = await import(
  '../dist/modules/admin/guards/admin.guard.js'
);

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

function transform(metatype, value, type = 'query') {
  return pipe.transform(value, { type, metatype });
}

test('AdminOrdersQueryDto transforms pagination and order number while preserving every approved filter', async () => {
  const defaults = await transform(AdminOrdersQueryDto, {});
  assert.equal(defaults.limit, 20);
  assert.equal(defaults.offset, 0);

  const query = await transform(AdminOrdersQueryDto, {
    limit: '50',
    offset: '4',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    fulfillmentStatus: 'PROCURED',
    number: '42',
    customerEmail: 'ADA@EXAMPLE.COM',
    customerPhone: '+995555',
    createdFrom: '2026-07-01T00:00:00.000Z',
    createdTo: '2026-07-31T23:59:59.999Z',
    search: 'Ada',
  });

  assert.deepEqual({ ...query }, {
    limit: 50,
    offset: 4,
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    fulfillmentStatus: 'PROCURED',
    number: 42,
    customerEmail: 'ADA@EXAMPLE.COM',
    customerPhone: '+995555',
    createdFrom: '2026-07-01T00:00:00.000Z',
    createdTo: '2026-07-31T23:59:59.999Z',
    search: 'Ada',
  });
});

test('AdminOrdersQueryDto rejects invalid enums, dates, bounds, and unknown filters', async () => {
  for (const query of [
    { status: 'DRAFT' },
    { paymentStatus: 'SETTLED' },
    { fulfillmentStatus: 'PACKING' },
    { number: '0' },
    { number: '1.5' },
    { number: '2147483648' },
    { customerEmail: 'e'.repeat(255) },
    { customerPhone: '1'.repeat(33) },
    { search: 's'.repeat(201) },
    { createdFrom: 'not-a-date' },
    { createdTo: '2026-02-31' },
    { unexpected: 'value' },
  ]) {
    await assert.rejects(
      transform(AdminOrdersQueryDto, query),
      (error) => error instanceof BadRequestException,
    );
  }
});

test('manager comment DTO accepts null or at most 2000 characters and procurement DTO accepts only its enum', async () => {
  const { UpdateManagerCommentDto } = await import(
    '../dist/modules/admin/dto/update-manager-comment.dto.js'
  );
  const { UpdateOrderItemProcurementStatusDto } = await import(
    '../dist/modules/admin/dto/update-order-item-procurement-status.dto.js'
  );

  assert.equal(
    (await transform(UpdateManagerCommentDto, { managerComment: null }, 'body'))
      .managerComment,
    null,
  );
  assert.equal(
    (
      await transform(
        UpdateManagerCommentDto,
        { managerComment: 'x'.repeat(2000) },
        'body',
      )
    ).managerComment.length,
    2000,
  );
  await assert.rejects(
    transform(
      UpdateManagerCommentDto,
      { managerComment: 'x'.repeat(2001) },
      'body',
    ),
    (error) => error instanceof BadRequestException,
  );
  await assert.rejects(
    transform(UpdateManagerCommentDto, {}, 'body'),
    (error) => error instanceof BadRequestException,
  );
  assert.equal(
    (
      await transform(
        UpdateOrderItemProcurementStatusDto,
        { procurementStatus: 'ORDERED' },
        'body',
      )
    ).procurementStatus,
    'ORDERED',
  );
  await assert.rejects(
    transform(
      UpdateOrderItemProcurementStatusDto,
      { procurementStatus: 'PACKING' },
      'body',
    ),
    (error) => error instanceof BadRequestException,
  );
});

function contextFor(user) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
}

test('AdminGuard accepts ADMIN and rejects USER or missing authentication', () => {
  const guard = new AdminGuard();
  assert.equal(
    guard.canActivate(contextFor({ userId: 'admin-1', role: 'ADMIN' })),
    true,
  );
  for (const user of [{ userId: 'user-1', role: 'USER' }, undefined]) {
    assert.throws(
      () => guard.canActivate(contextFor(user)),
      (error) => error instanceof ForbiddenException,
    );
  }
});
