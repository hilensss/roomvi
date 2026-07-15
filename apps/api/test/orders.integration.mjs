import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  test(
    'orders PostgreSQL integration suite',
    {
      skip:
        'TEST_DATABASE_URL is not set. Point it at a PostgreSQL database with the committed Prisma migrations already deployed; this suite never uses DATABASE_URL or runs migrations.',
    },
    () => {},
  );
} else {
  // Set the Prisma datasource before importing the generated client or services.
  process.env.DATABASE_URL = testDatabaseUrl;

  const database = await import('@roomvi/database');
  const { OrdersService } = await import(
    '../dist/modules/orders/orders.service.js'
  );
  const { AdminService } = await import(
    '../dist/modules/admin/admin.service.js'
  );

  const {
    CartItemSource,
    CartStatus,
    FulfillmentStatus,
    GenerationOwnerType,
    InteriorStyle,
    OrderItemProcurementStatus,
    OrderStatus,
    PaymentProvider,
    PaymentStatus,
    PrismaClient,
    ProductCategory,
    RoomProjectStatus,
    RoomType,
    StockStatus,
  } = database;

  const prisma = new PrismaClient();
  const orders = new OrdersService(prisma);
  const admin = new AdminService(prisma);
  const runPrefix = `rvit_${randomUUID().replaceAll('-', '')}`;
  let fixtureNumber = 0;

  const checkoutDto = {
    customerName: 'Integration Customer',
    customerEmail: `${runPrefix}@example.test`,
    customerPhone: '+995555123456',
    deliveryCity: 'Tbilisi',
    deliveryAddress: '1 Integration Test Avenue',
    deliveryPostalCode: '0108',
    deliveryComment: 'Integration delivery comment',
    customerComment: 'Integration customer comment',
  };

  function context(userId) {
    return { user: { userId, role: 'USER' } };
  }

  function hasHttpStatus(status) {
    return (error) => {
      assert.equal(error?.getStatus?.(), status);
      return true;
    };
  }

  async function createFixture({
    includeItems = true,
    productCount = 2,
    stockStatus = StockStatus.IN_STOCK,
  } = {}) {
    fixtureNumber += 1;
    const key = `${runPrefix}_${fixtureNumber}`;
    const userId = `${key}_user`;
    const supplierId = `${key}_supplier`;
    const cartId = `${key}_cart`;
    const roomProjectId = `${key}_project`;

    await prisma.user.create({
      data: {
        id: userId,
        email: `${key}@example.test`,
        passwordHash: 'integration-test-only',
        name: 'Integration User',
      },
    });

    await prisma.supplier.create({
      data: {
        id: supplierId,
        name: `Supplier ${key}`,
        slug: key,
        websiteUrl: `https://supplier.example.test/${key}`,
      },
    });

    const products = [];
    for (let index = 0; index < productCount; index += 1) {
      products.push(
        await prisma.product.create({
          data: {
            id: `${key}_product_${index}`,
            supplierId,
            externalId: `${key}_sku_${index}`,
            title: `Current product ${index}`,
            category: ProductCategory.CHAIR,
            roomTypes: [RoomType.LIVING_ROOM],
            styleTags: [InteriorStyle.MODERN],
            price: index === 0 ? 350 : 500,
            currency: 'RUB',
            stockStatus,
            imageUrls: [
              `https://cdn.example.test/${key}/product-${index}.jpg`,
            ],
            productUrl: `https://supplier.example.test/${key}/product-${index}`,
            isActive: true,
          },
        }),
      );
    }

    await prisma.roomProject.create({
      data: {
        id: roomProjectId,
        ownerType: GenerationOwnerType.USER,
        userId,
        title: `Project ${key}`,
        roomType: RoomType.LIVING_ROOM,
        style: InteriorStyle.MODERN,
        status: RoomProjectStatus.GENERATED,
      },
    });

    await prisma.cart.create({
      data: {
        id: cartId,
        userId,
        status: CartStatus.ACTIVE,
        totalAmount: 17,
        currency: 'RUB',
      },
    });

    if (includeItems) {
      await prisma.cartItem.createMany({
        data: products.map((product, index) => ({
          id: `${key}_cart_item_${index}`,
          cartId,
          productId: product.id,
          supplierId,
          source:
            index === 0
              ? CartItemSource.DESIGN_PROJECT
              : CartItemSource.CATALOG,
          roomProjectId: index === 0 ? roomProjectId : null,
          quantity: index === 0 ? 2 : 1,
          priceSnapshot: 10 + index,
          titleSnapshot: `Stale product ${index}`,
          imageSnapshot: `https://stale.example.test/${index}.jpg`,
          availabilitySnapshot: StockStatus.OUT_OF_STOCK,
        })),
      });
    }

    return {
      key,
      userId,
      supplierId,
      cartId,
      roomProjectId,
      products,
    };
  }

  async function cleanupRunRecords() {
    await prisma.order.deleteMany({
      where: { cartId: { startsWith: runPrefix } },
    });
    await prisma.cartItem.deleteMany({
      where: { cartId: { startsWith: runPrefix } },
    });
    await prisma.cart.deleteMany({
      where: { id: { startsWith: runPrefix } },
    });
    await prisma.roomProject.deleteMany({
      where: { id: { startsWith: runPrefix } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: runPrefix } },
    });
    await prisma.supplier.deleteMany({
      where: { id: { startsWith: runPrefix } },
    });
    await prisma.user.deleteMany({
      where: { id: { startsWith: runPrefix } },
    });
  }

  before(async () => {
    await prisma.$connect();
    const [schemaState] = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('"Payment"')::text AS "paymentTable"`,
    );
    if (!schemaState?.paymentTable) {
      throw new Error(
        'TEST_DATABASE_URL must point to PostgreSQL with the committed Prisma migrations already deployed. This suite never migrates automatically.',
      );
    }
  });

  after(async () => {
    await cleanupRunRecords();
    await prisma.$disconnect();
  });

  test('checkout persists server-owned snapshots and completes cart/project side effects', async () => {
    const fixture = await createFixture();

    try {
      const created = await orders.createOrder(
        checkoutDto,
        context(fixture.userId),
        `${fixture.key}_idempotency`,
      );

      assert.equal(created.subtotalAmount, 1_200);
      assert.equal(created.deliveryAmount, 0);
      assert.equal(created.totalAmount, 1_200);
      assert.equal(created.currency, 'RUB');
      assert.equal(created.items.length, 2);

      const firstItem = created.items.find(
        (item) => item.productId === fixture.products[0].id,
      );
      assert.equal(firstItem.priceSnapshot, 350);
      assert.equal(firstItem.totalPrice, 700);
      assert.equal(firstItem.titleSnapshot, 'Current product 0');
      assert.equal(
        firstItem.imageSnapshot,
        `https://cdn.example.test/${fixture.key}/product-0.jpg`,
      );
      assert.equal(firstItem.availabilitySnapshot, StockStatus.IN_STOCK);

      const stored = await prisma.order.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          items: true,
          payments: true,
          supplierOrders: true,
        },
      });
      assert.equal(stored.items.length, 2);
      assert.equal(stored.payments.length, 1);
      assert.equal(stored.payments[0].provider, PaymentProvider.MANUAL);
      assert.equal(stored.payments[0].status, PaymentStatus.PENDING);
      assert.equal(stored.payments[0].amount, 1_200);
      assert.equal(stored.payments[0].currency, 'RUB');
      assert.equal(stored.supplierOrders.length, 1);
      assert.equal(stored.supplierOrders[0].supplierId, fixture.supplierId);
      assert.equal(stored.supplierOrders[0].payload.currency, 'RUB');
      assert.equal(stored.supplierOrders[0].payload.items.length, 2);

      const supplierPayloadItem = stored.supplierOrders[0].payload.items.find(
        (item) => item.externalProductId === fixture.products[0].externalId,
      );
      assert.equal(supplierPayloadItem.price, 350);
      assert.equal(supplierPayloadItem.totalPrice, 700);
      assert.equal(supplierPayloadItem.title, 'Current product 0');

      const cart = await prisma.cart.findUniqueOrThrow({
        where: { id: fixture.cartId },
        include: { items: true },
      });
      assert.equal(cart.status, CartStatus.ORDER_CREATED);
      assert.equal(cart.totalAmount, 1_200);
      assert.equal(cart.items.length, 0);

      const project = await prisma.roomProject.findUniqueOrThrow({
        where: { id: fixture.roomProjectId },
      });
      assert.equal(project.status, RoomProjectStatus.ORDER_CREATED);

      await prisma.product.update({
        where: { id: fixture.products[0].id },
        data: { title: 'Changed after checkout', price: 999 },
      });
      await prisma.product.delete({
        where: { id: fixture.products[0].id },
      });

      const detachedItem = await prisma.orderItem.findFirstOrThrow({
        where: {
          orderId: created.id,
          externalProductId: fixture.products[0].externalId,
        },
      });
      assert.equal(detachedItem.productId, null);
      assert.equal(detachedItem.priceSnapshot, 350);
      assert.equal(detachedItem.totalPrice, 700);
      assert.equal(detachedItem.titleSnapshot, 'Current product 0');
      assert.equal(detachedItem.supplierNameSnapshot, `Supplier ${fixture.key}`);
      assert.equal(
        detachedItem.productUrlSnapshot,
        `https://supplier.example.test/${fixture.key}/product-0`,
      );
    } finally {
      await cleanupRunRecords();
    }
  });

  test('checkout rejects empty and unavailable active carts without side effects', async () => {
    const fixture = await createFixture({ includeItems: false });

    try {
      await assert.rejects(
        () => orders.createOrder(checkoutDto, context(fixture.userId)),
        hasHttpStatus(400),
      );

      await prisma.product.updateMany({
        where: { id: { in: fixture.products.map((product) => product.id) } },
        data: { stockStatus: StockStatus.OUT_OF_STOCK },
      });
      await prisma.cartItem.create({
        data: {
          id: `${fixture.key}_unavailable_item`,
          cartId: fixture.cartId,
          productId: fixture.products[0].id,
          supplierId: fixture.supplierId,
          source: CartItemSource.CATALOG,
          quantity: 1,
          priceSnapshot: 350,
          titleSnapshot: 'Unavailable item',
          availabilitySnapshot: StockStatus.IN_STOCK,
        },
      });

      await assert.rejects(
        () => orders.createOrder(checkoutDto, context(fixture.userId)),
        hasHttpStatus(400),
      );

      assert.equal(
        await prisma.order.count({ where: { cartId: fixture.cartId } }),
        0,
      );
      const cart = await prisma.cart.findUniqueOrThrow({
        where: { id: fixture.cartId },
        include: { items: true },
      });
      assert.equal(cart.status, CartStatus.ACTIVE);
      assert.equal(cart.totalAmount, 17);
      assert.equal(cart.items.length, 1);
    } finally {
      await cleanupRunRecords();
    }
  });

  test('idempotency, cart uniqueness, owner isolation and cancellation invariants hold', async () => {
    const idempotentFixture = await createFixture({ productCount: 1 });
    const uniqueCartFixture = await createFixture({ productCount: 1 });
    const cancellableFixture = await createFixture({ productCount: 1 });
    const paidFixture = await createFixture({ productCount: 1 });
    const outsiderFixture = await createFixture({
      includeItems: false,
      productCount: 1,
    });

    try {
      const idempotencyKey = `${idempotentFixture.key}_same_request`;
      const [firstReplay, secondReplay] = await Promise.all([
        orders.createOrder(
          checkoutDto,
          context(idempotentFixture.userId),
          idempotencyKey,
        ),
        orders.createOrder(
          { ...checkoutDto, customerName: 'Ignored replay body' },
          context(idempotentFixture.userId),
          idempotencyKey,
        ),
      ]);
      assert.equal(firstReplay.id, secondReplay.id);
      assert.equal(
        await prisma.order.count({
          where: { cartId: idempotentFixture.cartId },
        }),
        1,
      );

      const concurrentWithoutKey = await Promise.allSettled([
        orders.createOrder(checkoutDto, context(uniqueCartFixture.userId)),
        orders.createOrder(checkoutDto, context(uniqueCartFixture.userId)),
      ]);
      assert.equal(
        concurrentWithoutKey.filter((result) => result.status === 'fulfilled')
          .length,
        1,
      );
      assert.equal(
        concurrentWithoutKey.filter((result) => result.status === 'rejected')
          .length,
        1,
      );
      assert.equal(
        await prisma.order.count({
          where: { cartId: uniqueCartFixture.cartId },
        }),
        1,
      );

      const cancellable = await orders.createOrder(
        checkoutDto,
        context(cancellableFixture.userId),
      );
      await assert.rejects(
        () =>
          orders.getOrderById(
            cancellable.id,
            context(outsiderFixture.userId),
          ),
        hasHttpStatus(404),
      );
      await assert.rejects(
        () =>
          orders.cancelOrder(
            cancellable.id,
            context(outsiderFixture.userId),
          ),
        hasHttpStatus(404),
      );

      const cancelled = await orders.cancelOrder(
        cancellable.id,
        context(cancellableFixture.userId),
      );
      assert.equal(cancelled.status, OrderStatus.CANCELLED);
      assert.equal(cancelled.paymentStatus, PaymentStatus.CANCELLED);
      assert.ok(cancelled.cancelledAt instanceof Date);
      assert.equal(cancelled.payment.status, PaymentStatus.CANCELLED);

      const paid = await orders.createOrder(
        checkoutDto,
        context(paidFixture.userId),
      );
      const paidAt = new Date();
      await prisma.$transaction([
        prisma.order.update({
          where: { id: paid.id },
          data: {
            status: OrderStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PAID,
            paidAt,
          },
        }),
        prisma.payment.updateMany({
          where: { orderId: paid.id },
          data: { status: PaymentStatus.PAID, paidAt },
        }),
      ]);
      await assert.rejects(
        () => orders.cancelOrder(paid.id, context(paidFixture.userId)),
        hasHttpStatus(409),
      );
      const stillPaid = await prisma.order.findUniqueOrThrow({
        where: { id: paid.id },
      });
      assert.equal(stillPaid.status, OrderStatus.CONFIRMED);
      assert.equal(stillPaid.paymentStatus, PaymentStatus.PAID);
      assert.equal(stillPaid.cancelledAt, null);
    } finally {
      await cleanupRunRecords();
    }
  });

  test('admin procurement updates recompute aggregate fulfillment in the same database transaction', async () => {
    const fixture = await createFixture();

    try {
      const created = await orders.createOrder(
        checkoutDto,
        context(fixture.userId),
      );
      const [firstItem, secondItem] = created.items;

      let updated = await admin.updateOrderItemProcurementStatus(
        created.id,
        firstItem.id,
        { procurementStatus: OrderItemProcurementStatus.ORDERED },
      );
      assert.equal(updated.fulfillmentStatus, FulfillmentStatus.PROCUREMENT);

      updated = await admin.updateOrderItemProcurementStatus(
        created.id,
        firstItem.id,
        {
          procurementStatus:
            OrderItemProcurementStatus.CONFIRMED_BY_SUPPLIER,
        },
      );
      assert.equal(
        updated.fulfillmentStatus,
        FulfillmentStatus.PARTIALLY_PROCURED,
      );

      await admin.updateOrderItemProcurementStatus(
        created.id,
        secondItem.id,
        { procurementStatus: OrderItemProcurementStatus.ORDERED },
      );
      updated = await admin.updateOrderItemProcurementStatus(
        created.id,
        secondItem.id,
        {
          procurementStatus:
            OrderItemProcurementStatus.CONFIRMED_BY_SUPPLIER,
        },
      );
      assert.equal(updated.fulfillmentStatus, FulfillmentStatus.PROCURED);

      await admin.updateOrderItemProcurementStatus(
        created.id,
        firstItem.id,
        { procurementStatus: OrderItemProcurementStatus.SHIPPED },
      );
      updated = await admin.updateOrderItemProcurementStatus(
        created.id,
        secondItem.id,
        { procurementStatus: OrderItemProcurementStatus.SHIPPED },
      );
      assert.equal(updated.fulfillmentStatus, FulfillmentStatus.SHIPPED);

      await admin.updateOrderItemProcurementStatus(
        created.id,
        firstItem.id,
        { procurementStatus: OrderItemProcurementStatus.DELIVERED },
      );
      updated = await admin.updateOrderItemProcurementStatus(
        created.id,
        secondItem.id,
        { procurementStatus: OrderItemProcurementStatus.DELIVERED },
      );
      assert.equal(updated.fulfillmentStatus, FulfillmentStatus.DELIVERED);

      const stored = await prisma.order.findUniqueOrThrow({
        where: { id: created.id },
        include: { items: true },
      });
      assert.equal(stored.fulfillmentStatus, FulfillmentStatus.DELIVERED);
      assert.ok(
        stored.items.every(
          (item) =>
            item.procurementStatus === OrderItemProcurementStatus.DELIVERED,
        ),
      );
    } finally {
      await cleanupRunRecords();
    }
  });

  test('checkout rolls back order graph and cart/project mutations when a late transaction step fails', async () => {
    const fixture = await createFixture({ productCount: 1 });
    const databaseObjectSuffix = `${runPrefix}_${fixtureNumber}`.replaceAll(
      /[^a-zA-Z0-9_]/g,
      '_',
    );
    const functionName = `rvit_fail_cart_update_${databaseObjectSuffix}`;
    const triggerName = `rvit_fail_checkout_${databaseObjectSuffix}`;

    try {
      // Cart update happens after nested Order/OrderItem/Payment/SupplierOrder
      // creation. The trigger therefore proves all prior writes roll back too.
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION "${functionName}"() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW."id" = '${fixture.cartId}'
             AND NEW."status"::text = 'ORDER_CREATED' THEN
            RAISE EXCEPTION 'forced integration checkout rollback';
          END IF;
          RETURN NEW;
        END;
        $$
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER "${triggerName}"
        BEFORE UPDATE ON "Cart"
        FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
      `);

      await assert.rejects(() =>
        orders.createOrder(checkoutDto, context(fixture.userId)),
      );

      assert.equal(
        await prisma.order.count({ where: { cartId: fixture.cartId } }),
        0,
      );
      assert.equal(
        await prisma.payment.count({
          where: { order: { cartId: fixture.cartId } },
        }),
        0,
      );
      assert.equal(
        await prisma.supplierOrder.count({
          where: { order: { cartId: fixture.cartId } },
        }),
        0,
      );

      const cart = await prisma.cart.findUniqueOrThrow({
        where: { id: fixture.cartId },
        include: { items: true },
      });
      assert.equal(cart.status, CartStatus.ACTIVE);
      assert.equal(cart.totalAmount, 17);
      assert.equal(cart.items.length, 1);

      const project = await prisma.roomProject.findUniqueOrThrow({
        where: { id: fixture.roomProjectId },
      });
      assert.equal(project.status, RoomProjectStatus.GENERATED);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "Cart"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS "${functionName}"()`,
      );
      await cleanupRunRecords();
    }
  });
}
