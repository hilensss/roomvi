import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { GenerationScenario } from '@roomvi/database';
import { CartService } from '../dist/modules/cart/cart.service.js';
import { DesignVariantsService } from '../dist/modules/design-variants/design-variants.service.js';
import { GenerationApiService } from '../dist/modules/generation/generation-api.service.js';

const user = { userId: 'manager-1', email: 'manager@example.com', role: 'MANAGER' };
const guestService = {
  findValidSessionByAnonymousId: async () => null,
};

test('Marketplace project list excludes B2B room projects', async () => {
  let query;
  const service = new GenerationApiService(
    {
      roomProject: {
        findMany: async (args) => {
          query = args;
          return [];
        },
      },
    },
    guestService,
    { enqueueGeneration: async () => undefined },
  );

  await service.listMyProjects({ user });

  assert.deepEqual(query.where, {
    userId: 'manager-1',
    b2bProject: null,
  });
});

test('Marketplace job lookup only loads Marketplace generation jobs', async () => {
  let query;
  const service = new GenerationApiService(
    {
      generationJob: {
        findFirst: async (args) => {
          query = args;
          return null;
        },
      },
    },
    guestService,
    { enqueueGeneration: async () => undefined },
  );

  await assert.rejects(
    service.getGenerationJob('b2b-job', { user }),
    (error) => error instanceof NotFoundException,
  );
  assert.deepEqual(query.where, {
    id: 'b2b-job',
    scenario: GenerationScenario.MARKETPLACE,
  });
});

test('Marketplace project lookup excludes room projects linked to B2B', async () => {
  let query;
  const service = new GenerationApiService(
    {
      roomProject: {
        findFirst: async (args) => {
          query = args;
          return null;
        },
      },
    },
    guestService,
    { enqueueGeneration: async () => undefined },
  );

  await assert.rejects(
    service.getProject('b2b-room-project', { user }),
    (error) => error instanceof NotFoundException,
  );
  assert.deepEqual(query.where, {
    id: 'b2b-room-project',
    b2bProject: null,
  });
});

test('Marketplace design actions exclude variants linked to B2B', async () => {
  const queries = [];
  const service = new DesignVariantsService(
    {
      designVariant: {
        findFirst: async (args) => {
          queries.push(args);
          return null;
        },
      },
    },
    guestService,
  );

  await assert.rejects(
    service.getDesignVariantById('b2b-variant', { user }),
    (error) => error instanceof NotFoundException,
  );
  await assert.rejects(
    service.selectDesignVariant('b2b-variant', { user }),
    (error) => error instanceof NotFoundException,
  );

  assert.deepEqual(
    queries.map(({ where }) => where),
    [
      {
        id: 'b2b-variant',
        roomProject: { b2bProject: null },
      },
      {
        id: 'b2b-variant',
        roomProject: { b2bProject: null },
      },
    ],
  );
});

test('Marketplace cart cannot consume a B2B design variant', async () => {
  let query;
  const service = new CartService(
    {
      designVariant: {
        findFirst: async (args) => {
          query = args;
          return null;
        },
      },
    },
    guestService,
  );

  await assert.rejects(
    service.addDesignVariantToCart('b2b-variant', { user }),
    (error) => error instanceof NotFoundException,
  );
  assert.deepEqual(query.where, {
    id: 'b2b-variant',
    roomProject: { b2bProject: null },
  });
});
