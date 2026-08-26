import assert from 'node:assert/strict';
import test from 'node:test';
import { CartService } from '../dist/modules/cart/cart.service.js';

function product() {
  return {
    id: 'product-1',
    supplierId: 'supplier-1',
    title: 'Sofa',
    price: 10_000,
    imageUrls: ['https://cdn.example.com/sofa.jpg'],
    stockStatus: 'IN_STOCK',
    isActive: true,
  };
}

function cartPrisma() {
  const itemUpdates = [];
  const lookups = [];
  const activeCart = { id: 'cart-1', userId: 'user-1', items: [] };
  const prisma = {
    product: { findUnique: async () => product() },
    cart: {
      findFirst: async () => activeCart,
      findUnique: async () => ({
        ...activeCart,
        items: [
          {
            priceSnapshot: 10_000,
            quantity: 2,
            product: product(),
          },
        ],
      }),
      update: async (args) => args.data,
    },
    cartItem: {
      findUnique: async (args) => {
        lookups.push(args);
        return { id: 'item-1' };
      },
      update: async (args) => {
        itemUpdates.push(args);
        return args.data;
      },
      create: async () => assert.fail('duplicate cart item was created'),
    },
    $transaction: async (operations) => Promise.all(operations),
  };

  return { itemUpdates, lookups, prisma };
}

const userContext = {
  user: { userId: 'user-1', email: 'user@example.com', role: 'USER' },
};

test('catalog addition reuses the schema-level cart/product identity', async () => {
  const { itemUpdates, lookups, prisma } = cartPrisma();
  const service = new CartService(prisma, {});

  await service.addCatalogProductToCart('product-1', 1, userContext);

  assert.deepEqual(lookups, [
    {
      where: {
        cartId_productId: { cartId: 'cart-1', productId: 'product-1' },
      },
    },
  ]);
  assert.deepEqual(itemUpdates[0], {
    where: { id: 'item-1' },
    data: {
      quantity: { increment: 1 },
      priceSnapshot: 10_000,
      titleSnapshot: 'Sofa',
      imageSnapshot: 'https://cdn.example.com/sofa.jpg',
      availabilitySnapshot: 'IN_STOCK',
    },
  });
});

test('design addition attaches existing product quantity to the selected design', async () => {
  const { itemUpdates, prisma } = cartPrisma();
  prisma.designVariant = {
    findFirst: async () => ({
      id: 'variant-1',
      roomProjectId: 'project-1',
      roomProject: {
        id: 'project-1',
        userId: 'user-1',
        guestSessionId: null,
      },
      products: [{ product: product() }],
    }),
    updateMany: async (args) => args.data,
    update: async (args) => args.data,
  };
  prisma.roomProject = { update: async (args) => args.data };
  const service = new CartService(prisma, {});

  await service.addDesignVariantToCart('variant-1', userContext);

  assert.deepEqual(itemUpdates[0], {
    where: { id: 'item-1' },
    data: {
      quantity: { increment: 1 },
      priceSnapshot: 10_000,
      titleSnapshot: 'Sofa',
      imageSnapshot: 'https://cdn.example.com/sofa.jpg',
      availabilitySnapshot: 'IN_STOCK',
      source: 'DESIGN_PROJECT',
      roomProjectId: 'project-1',
      designVariantId: 'variant-1',
    },
  });
});
