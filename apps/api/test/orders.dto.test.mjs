import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

const { CreateOrderDto } = await import(
  '../dist/modules/orders/dto/create-order.dto.js'
);

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const validBody = {
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  customerPhone: '+995555123456',
  deliveryCity: 'Tbilisi',
  deliveryAddress: '1 Rustaveli Avenue',
  deliveryPostalCode: '0108',
  deliveryComment: 'Call on arrival',
  customerComment: 'Please handle carefully',
};

function transformBody(body) {
  return pipe.transform(body, { type: 'body', metatype: CreateOrderDto });
}

test('CreateOrderDto accepts only the approved checkout fields', async () => {
  const result = await transformBody(validBody);
  assert.deepEqual({ ...result }, validBody);

  for (const injected of [
    { totalAmount: 1 },
    { price: 1 },
    { supplierId: 'supplier-1' },
    { comment: 'legacy' },
    { deliveryDate: '2026-07-20' },
  ]) {
    await assert.rejects(
      transformBody({ ...validBody, ...injected }),
      (error) => error instanceof BadRequestException,
    );
  }
});

test('CreateOrderDto validates required values and every documented bound', async () => {
  const invalidBodies = [
    { ...validBody, customerName: 'A' },
    { ...validBody, customerName: 'A'.repeat(121) },
    { ...validBody, customerEmail: 'not-an-email' },
    { ...validBody, customerEmail: `${'a'.repeat(243)}@example.com` },
    { ...validBody, customerPhone: '1234' },
    { ...validBody, customerPhone: '1'.repeat(33) },
    { ...validBody, deliveryCity: 'T' },
    { ...validBody, deliveryCity: 'T'.repeat(121) },
    { ...validBody, deliveryAddress: 'tiny' },
    { ...validBody, deliveryAddress: 'A'.repeat(501) },
    { ...validBody, deliveryPostalCode: '1'.repeat(33) },
    { ...validBody, deliveryComment: 'C'.repeat(1001) },
    { ...validBody, customerComment: 'C'.repeat(1001) },
  ];

  for (const body of invalidBodies) {
    await assert.rejects(
      transformBody(body),
      (error) => error instanceof BadRequestException,
    );
  }

  for (const field of [
    'customerName',
    'customerEmail',
    'customerPhone',
    'deliveryCity',
    'deliveryAddress',
  ]) {
    const body = { ...validBody };
    delete body[field];
    await assert.rejects(
      transformBody(body),
      (error) => error instanceof BadRequestException,
    );
  }
});
