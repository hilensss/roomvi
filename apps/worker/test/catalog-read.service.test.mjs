import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InteriorStyle,
  RoomType,
  StockStatus,
} from '@roomvi/database';

const { CatalogReadService } = await import(
  '../dist/modules/catalog/catalog-read.service.js'
);

test('AI candidate query keeps all hard eligibility and supplier filters', async () => {
  let query;
  const service = new CatalogReadService({
    product: {
      findMany: async (input) => {
        query = input;
        return [];
      },
    },
  });

  await service.findAiEligibleProducts({
    roomType: RoomType.OFFICE,
    style: InteriorStyle.MODERN,
    supplierId: 'supplier-1',
    maxBudget: 90_000,
    limit: 24,
  });

  assert.deepEqual(query.where, {
    isActive: true,
    isAiEligible: true,
    stockStatus: StockStatus.IN_STOCK,
    imageUrls: { isEmpty: false },
    supplierId: 'supplier-1',
    roomTypes: { has: RoomType.OFFICE },
    styleTags: { has: InteriorStyle.MODERN },
    price: { lte: 90_000 },
  });
  assert.equal(query.take, 24);
});
