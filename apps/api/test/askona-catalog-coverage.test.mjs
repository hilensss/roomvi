import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const products = JSON.parse(
  await readFile(
    new URL('../src/modules/catalog/mock/mock-products.json', import.meta.url),
    'utf8',
  ),
);

const categoriesForRoom = (roomType) =>
  new Set(
    products
      .filter((product) => product.roomTypes.includes(roomType))
      .map((product) => product.category),
  );

test('Askona catalog covers developer-project room categories', () => {
  const expected = {
    HALLWAY: ['WARDROBE', 'SHOE_CABINET', 'MIRROR', 'BENCH', 'HANGER'],
    KIDS_ROOM: ['BED', 'DESK', 'CHAIR', 'SHELF', 'WARDROBE'],
    BATHROOM: ['MIRROR', 'DECOR'],
    OFFICE: ['DESK', 'CHAIR', 'SHELF', 'LAMP'],
  };

  for (const [roomType, categories] of Object.entries(expected)) {
    const available = categoriesForRoom(roomType);

    for (const category of categories) {
      assert.ok(
        available.has(category),
        `${roomType} must include ${category}`,
      );
    }
  }
});

test('new room categories use unique official Askona records', () => {
  const externalIds = products.map((product) => product.externalId);
  assert.equal(new Set(externalIds).size, externalIds.length);

  for (const product of products) {
    assert.match(product.productUrl, /^https:\/\/(?:[a-z-]+\.)?askona\.ru\//);
    assert.ok(product.imageUrls.length > 0);
    assert.ok(
      product.imageUrls.every((url) => url.startsWith('https://ir.askona.ru/')),
    );
  }
});
