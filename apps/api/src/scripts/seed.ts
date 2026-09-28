// Seeds the control plane, platform admin, demo tenants and their catalogs. Run: pnpm seed
import { hash as hashPassword } from '@node-rs/argon2';
import { PrismaClient as TenantPrismaClient } from '../generated/tenant/index.js';
import { controlDb } from '../db/control.js';
import { provisionTenant } from './provision-tenant.js';
import { logger } from '../lib/logger.js';
import { TIRES, WHEELS, VEHICLES, TIRE_IMAGES, WHEEL_IMAGES, slugify } from './catalog-data.js';

const DEMO_PASSWORD = 'Treadcart!2345';

// Every store gets tires and wheels, with mixed stock so all stock filters have rows.
async function seedTenantData(databaseUrl: string): Promise<void> {
  const db = new TenantPrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    const [retail, trade, fleet] = await Promise.all([
      db.customerGroup.upsert({
        where: { code: 'RETAIL' },
        create: { code: 'RETAIL', name: 'Retail', defaultDiscountBps: 0, priority: 0 },
        update: {},
      }),
      db.customerGroup.upsert({
        where: { code: 'TRADE' },
        create: { code: 'TRADE', name: 'Trade / Installer', defaultDiscountBps: 800, priority: 10 },
        update: {},
      }),
      db.customerGroup.upsert({
        where: { code: 'FLEET' },
        create: { code: 'FLEET', name: 'Fleet', defaultDiscountBps: 1200, priority: 20 },
        update: {},
      }),
    ]);

    const vehicles = [];
    for (const v of VEHICLES) {
      vehicles.push(
        await db.vehicle.upsert({
          where: {
            year_make_model_trim: { year: v.year, make: v.make, model: v.model, trim: v.trim },
          },
          create: v,
          update: {},
        }),
      );
    }

    const skuIds: string[] = [];

    // --- Tires ---
    for (const [i, t] of TIRES.entries()) {
      const brand = await db.brand.upsert({
        where: { slug: slugify(t.brand) },
        create: { name: t.brand, slug: slugify(t.brand) },
        update: { name: t.brand },
      });

      const name = t.brand + ' ' + t.model + ' ' + t.size;
      const slug = slugify(name);
      const skuCode =
        t.brand.slice(0, 3).toUpperCase() + '-' + t.size.replace(/[^A-Z0-9]+/gi, '');

      const product = await db.product.upsert({
        where: { slug },
        create: { slug, name, type: 'TIRE', brandId: brand.id, description: t.description },
        update: { name, description: t.description, brandId: brand.id, isActive: true },
      });

      const sku = await db.sku.upsert({
        where: { sku: skuCode },
        create: {
          sku: skuCode,
          productId: product.id,
          basePriceCents: t.priceCents,
          compareAtCents: t.compareAtCents,
          weightGrams: 9500,
          sectionWidthMm: t.width,
          aspectRatio: t.ratio,
          rimDiameterIn: t.rim,
          loadIndex: t.loadIndex,
          speedRating: t.speed,
          season: t.season,
          treadwear: t.treadwear,
        },
        update: { basePriceCents: t.priceCents, compareAtCents: t.compareAtCents },
      });
      skuIds.push(sku.id);

      await db.inventoryItem.upsert({
        where: { skuId: sku.id },
        create: { skuId: sku.id, onHand: t.onHand, reorderAt: t.reorderAt },
        update: { onHand: t.onHand, reorderAt: t.reorderAt },
      });

      // Replaced wholesale, so re-seeding cannot pile up duplicate images.
      await db.productImage.deleteMany({ where: { productId: product.id } });
      await db.productImage.create({
        data: {
          productId: product.id,
          url: TIRE_IMAGES[i % TIRE_IMAGES.length]!,
          alt: name,
          position: 0,
        },
      });

      const vehicle = vehicles[i % vehicles.length]!;
      await db.skuFitment.upsert({
        where: {
          skuId_vehicleId_position: { skuId: sku.id, vehicleId: vehicle.id, position: 'ALL' },
        },
        create: { skuId: sku.id, vehicleId: vehicle.id, position: 'ALL', isOem: i === 0 },
        update: {},
      });
    }

    // --- Wheels ---
    for (const [i, w] of WHEELS.entries()) {
      const brand = await db.brand.upsert({
        where: { slug: slugify(w.brand) },
        create: { name: w.brand, slug: slugify(w.brand) },
        update: { name: w.brand },
      });

      const name = w.brand + ' ' + w.model + ' ' + w.size;
      const slug = slugify(name);
      const skuCode =
        w.brand.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() +
        '-' +
        w.size.replace(/[^A-Z0-9]+/gi, '');

      const product = await db.product.upsert({
        where: { slug },
        create: { slug, name, type: 'WHEEL', brandId: brand.id, description: w.description },
        update: { name, description: w.description, brandId: brand.id, isActive: true },
      });

      const sku = await db.sku.upsert({
        where: { sku: skuCode },
        create: {
          sku: skuCode,
          productId: product.id,
          basePriceCents: w.priceCents,
          compareAtCents: w.compareAtCents,
          weightGrams: w.weightGrams,
          rimDiameterIn: w.rim,
          wheelWidthIn: w.widthIn,
          boltPattern: w.boltPattern,
          offsetMm: w.offsetMm,
          centerBoreMm: w.centerBoreMm,
          finish: w.finish,
        },
        update: { basePriceCents: w.priceCents, compareAtCents: w.compareAtCents },
      });
      skuIds.push(sku.id);

      await db.inventoryItem.upsert({
        where: { skuId: sku.id },
        create: { skuId: sku.id, onHand: w.onHand, reorderAt: w.reorderAt },
        update: { onHand: w.onHand, reorderAt: w.reorderAt },
      });

      await db.productImage.deleteMany({ where: { productId: product.id } });
      await db.productImage.create({
        data: {
          productId: product.id,
          url: WHEEL_IMAGES[i % WHEEL_IMAGES.length]!,
          alt: name,
          position: 0,
        },
      });

      const vehicle = vehicles[(i + 2) % vehicles.length]!;
      await db.skuFitment.upsert({
        where: {
          skuId_vehicleId_position: { skuId: sku.id, vehicleId: vehicle.id, position: 'ALL' },
        },
        create: { skuId: sku.id, vehicleId: vehicle.id, position: 'ALL', isOem: false },
        update: {},
      });
    }

    for (const [i, skuId] of skuIds.slice(0, 6).entries()) {
      const sku = await db.sku.findUniqueOrThrow({ where: { id: skuId } });
      await db.customerGroupPrice.upsert({
        where: { groupId_skuId_minQuantity: { groupId: trade.id, skuId, minQuantity: 1 } },
        create: {
          groupId: trade.id,
          skuId,
          priceCents: Math.round(sku.basePriceCents * 0.88),
          minQuantity: 1,
        },
        update: {},
      });
      if (i % 2 === 0) {
        await db.customerGroupPrice.upsert({
          where: { groupId_skuId_minQuantity: { groupId: fleet.id, skuId, minQuantity: 4 } },
          create: { groupId: fleet.id, skuId, discountBps: 1800, minQuantity: 4 },
          update: {},
        });
      }
    }

    const customers: { email: string; first: string; last: string; groupId: string }[] = [
      { email: 'zainab.malik@example.com', first: 'Zainab', last: 'Malik', groupId: trade.id },
      { email: 'ali.hassan@example.com', first: 'Ali', last: 'Hassan', groupId: retail.id },
      { email: 'hamza.sheikh@example.com', first: 'Hamza', last: 'Sheikh', groupId: fleet.id },
      { email: 'sana.iqbal@example.com', first: 'Sana', last: 'Iqbal', groupId: retail.id },
      { email: 'daniel.roy@example.com', first: 'Daniel', last: 'Roy', groupId: retail.id },
    ];

    const created = [];
    for (const c of customers) {
      created.push(
        await db.customer.upsert({
          where: { email: c.email },
          create: { email: c.email, firstName: c.first, lastName: c.last, groupId: c.groupId },
          update: { firstName: c.first, lastName: c.last, groupId: c.groupId },
        }),
      );
    }

    await db.customer.deleteMany({ where: { email: { notIn: customers.map((c) => c.email) } } });

    // Clear orders first so unreferenced products can be deleted.
    await db.orderItem.deleteMany();
    await db.orderEvent.deleteMany();
    await db.order.deleteMany();

    const expectedSlugs = [
      ...TIRES.map((t) => slugify(`${t.brand} ${t.model} ${t.size}`)),
      ...WHEELS.map((w) => slugify(`${w.brand} ${w.model} ${w.size}`)),
    ];
    const strays = await db.product.findMany({
      where: { slug: { notIn: expectedSlugs } },
      include: { skus: { include: { orderItems: { take: 1 } } } },
    });
    for (const stray of strays) {
      // Products on orders are hidden, never deleted.
      const referenced = stray.skus.some((sk) => sk.orderItems.length > 0);
      if (referenced) {
        await db.product.update({ where: { id: stray.id }, data: { isActive: false } });
      } else {
        await db.product.delete({ where: { id: stray.id } });
      }
    }

    // Brands left with nothing to sell are noise in the filter sidebar.
    await db.brand.deleteMany({ where: { products: { none: {} } } });

    await seedOrders(db, created);
  } finally {
    await db.$disconnect();
  }
}


/** How many orders each store gets. Small enough that the lists stay readable. */
const ORDERS_PER_TENANT = 10;

// Orders over 60 days, weighted recent so dashboard trends show growth.
async function seedOrders(
  db: TenantPrismaClient,
  customers: { id: string; email: string }[],
): Promise<void> {
  // Rebuild every run, so changing ORDERS_PER_TENANT actually takes effect.
  await db.orderItem.deleteMany();
  await db.orderEvent.deleteMany();
  await db.order.deleteMany();

  const skus = await db.sku.findMany({ include: { product: true } });
  if (skus.length === 0 || customers.length === 0) return;

  const statuses = ['DELIVERED', 'DELIVERED', 'SHIPPED', 'PAID', 'FULFILLING', 'CANCELLED'] as const;
  const DAY = 24 * 60 * 60 * 1000;

  // Two thirds land in the last 30 days, the rest in the 30 before that.
  const recentCount = Math.ceil(ORDERS_PER_TENANT * 0.65);

  for (let i = 0; i < ORDERS_PER_TENANT; i += 1) {
    const isRecent = i < recentCount;
    const dayOffset = isRecent
      ? Math.floor((i / Math.max(recentCount, 1)) * 29)
      : 30 + Math.floor(((i - recentCount) / Math.max(ORDERS_PER_TENANT - recentCount, 1)) * 29);

    const sku = skus[i % skus.length]!;
    const customer = customers[i % customers.length]!;
    const quantity = [1, 2, 4, 4][i % 4]!;
    const subtotal = sku.basePriceCents * quantity;
    const tax = Math.round(subtotal * 0.0825);
    const shipping = subtotal > 50_000 ? 0 : 1_995;
    const createdAt = new Date(Date.now() - dayOffset * DAY - Math.random() * DAY);
    const status = statuses[i % statuses.length]!;

    await db.order.create({
      data: {
        number: `TC-1${String(i).padStart(5, '0')}`,
        status,
        customerId: customer.id,
        email: customer.email,
        subtotalCents: subtotal,
        taxCents: tax,
        shippingCents: shipping,
        totalCents: subtotal + tax + shipping,
        createdAt,
        paidAt: status === 'CANCELLED' ? null : createdAt,
        items: {
          create: {
            skuId: sku.id,
            quantity,
            unitPriceCents: sku.basePriceCents,
            listPriceCents: sku.basePriceCents,
            nameSnapshot: sku.product.name,
          },
        },
      },
    });
  }
}

/** Support tickets and marketing banners, which live in the control plane. */
async function seedPlatformOps(adminId: string): Promise<void> {
  const tenantBySlug = new Map(
    (await controlDb.tenant.findMany()).map((t) => [t.slug, t.id] as const),
  );
  const HOUR = 60 * 60 * 1000;

  // Demo content is rebuilt on every run.
  await controlDb.ticketMessage.deleteMany();
  await controlDb.supportTicket.deleteMany();
  await controlDb.platformBanner.deleteMany();

  const tickets = [
    {
      number: 'TC-10482',
      subject: 'Refund not received',
      tenantSlug: 'apexauto',
      requesterName: 'Ayesha Siddiqui',
      requesterEmail: 'ayesha.siddiqui@example.com',
      status: 'ESCALATED' as const,
      priority: 'URGENT' as const,
      slaHours: 2,
      messages: [
        { fromStaff: false, author: 'Ayesha Siddiqui', body: 'I was told my refund would be processed in 5 days and I still have not received it.' },
        { fromStaff: true, author: 'Anees Ur Rehman', body: 'Sorry for the delay — I can see the refund was approved on the store side. Escalating to payments now.' },
      ],
    },
    {
      number: 'TC-10483',
      subject: 'Store not accepting orders',
      tenantSlug: 'wheelworks',
      requesterName: 'Bilal Ahmed',
      requesterEmail: 'bilal.ahmed@example.com',
      status: 'OPEN' as const,
      priority: 'HIGH' as const,
      slaHours: 4,
      messages: [
        { fromStaff: false, author: 'Bilal Ahmed', body: 'Checkout returns an error for every customer since this morning.' },
      ],
    },
    {
      number: 'TC-10484',
      subject: 'Wrong tire size delivered',
      tenantSlug: 'apexauto',
      requesterName: 'Fatima Khan',
      requesterEmail: 'fatima.khan@example.com',
      status: 'PENDING' as const,
      priority: 'MEDIUM' as const,
      slaHours: 18,
      messages: [
        { fromStaff: false, author: 'Fatima Khan', body: 'I ordered 225/45R17 and received 235/40R18.' },
        { fromStaff: true, author: 'Anees Ur Rehman', body: 'Apologies — arranging a pickup and a replacement at no charge.' },
      ],
    },
    {
      number: 'TC-10485',
      subject: 'Fitment data looks wrong for 2021 Civic',
      tenantSlug: 'wheelworks',
      requesterName: 'Usman Tariq',
      requesterEmail: 'usman.tariq@example.com',
      status: 'OPEN' as const,
      priority: 'LOW' as const,
      slaHours: 36,
      messages: [
        { fromStaff: false, author: 'Usman Tariq', body: 'The catalog shows a 5x114.3 wheel fitting a car that is 5x100.' },
      ],
    },
    {
      number: 'TC-10486',
      subject: 'Payment deducted twice',
      tenantSlug: 'apexauto',
      requesterName: 'Hina Abbas',
      requesterEmail: 'hina.abbas@example.com',
      status: 'ESCALATED' as const,
      priority: 'URGENT' as const,
      slaHours: 1,
      messages: [
        { fromStaff: false, author: 'Hina Abbas', body: 'My card was charged twice for order TC-884120.' },
      ],
    },
  ];

  for (const t of tickets) {
    const tenantId = tenantBySlug.get(t.tenantSlug);
    if (!tenantId) continue;

    await controlDb.supportTicket.create({
      data: {
        number: t.number,
        subject: t.subject,
        tenantId,
        requesterName: t.requesterName,
        requesterEmail: t.requesterEmail,
        status: t.status,
        priority: t.priority,
        assigneeId: t.status === 'OPEN' ? null : adminId,
        slaDueAt: new Date(Date.now() + t.slaHours * HOUR),
        messages: {
          create: t.messages.map((m, i) => ({
            fromStaff: m.fromStaff,
            authorName: m.author,
            body: m.body,
            createdAt: new Date(Date.now() - (t.messages.length - i) * HOUR),
          })),
        },
      },
    });
  }

  const banners = [
    { title: 'Winter tire changeover', placement: 'HOME_HERO' as const, status: 'LIVE' as const,
      from: '#0F5132', to: '#166534', startsIn: -8, endsIn: 7 },
    { title: 'New store spotlight — Torque Lab', placement: 'CATEGORY_PAGE' as const, status: 'LIVE' as const,
      from: '#1E3A8A', to: '#2563EB', startsIn: -5, endsIn: 10 },
    { title: 'Performance wheel preview', placement: 'HOME_HERO' as const, status: 'SCHEDULED' as const,
      from: '#9F1239', to: '#BE123C', startsIn: 14, endsIn: 30 },
    { title: 'Back to school fitment deals', placement: 'CATEGORY_PAGE' as const, status: 'ENDED' as const,
      from: '#B45309', to: '#D97706', startsIn: -60, endsIn: -30 },
  ];

  for (const b of banners) {
    const DAY = 24 * HOUR;
    await controlDb.platformBanner.create({
      data: {
        title: b.title,
        placement: b.placement,
        status: b.status,
        gradientFrom: b.from,
        gradientTo: b.to,
        startsAt: new Date(Date.now() + b.startsIn * DAY),
        endsAt: new Date(Date.now() + b.endsIn * DAY),
      },
    });
  }
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // tenantId is null, and NULLs never match a unique index, so this can't be an upsert.
  const existingAdmin = await controlDb.staffUser.findFirst({
    where: { email: 'admin@treadcart.test', tenantId: null },
  });
  const platformAdmin = existingAdmin
    ? await controlDb.staffUser.update({
        where: { id: existingAdmin.id },
        data: { passwordHash, role: 'PLATFORM_ADMIN', name: 'Anees Ur Rehman' },
      })
    : await controlDb.staffUser.create({
        data: {
          email: 'admin@treadcart.test',
          passwordHash,
          name: 'Anees Ur Rehman',
          role: 'PLATFORM_ADMIN',
          tenantId: null,
        },
      });

  const tenants = [
    { slug: 'apexauto', name: 'Apex Auto', host: 'apexauto.localhost',
      brandPrimary: '#0F5132', brandAccent: '#84CC16',
      owner: 'Imran Qureshi', catalogManager: 'Sadia Nawaz' },
    { slug: 'wheelworks', name: 'WheelWorks', host: 'wheelworks.localhost',
      brandPrimary: '#1E3A8A', brandAccent: '#38BDF8',
      owner: 'Tariq Mehmood', catalogManager: 'Mariam Aslam' },
    { slug: 'torquelab', name: 'Torque Lab', host: 'torquelab.localhost',
      brandPrimary: '#7C2D12', brandAccent: '#F59E0B',
      owner: 'Owais Farooq', catalogManager: 'Laura Bennett' },
  ];

  for (const t of tenants) {
    const { id, databaseUrl } = await provisionTenant({
      slug: t.slug,
      name: t.name,
      host: t.host,
      brandPrimary: t.brandPrimary,
      brandAccent: t.brandAccent,
    });

    await controlDb.staffUser.upsert({
      where: { tenantId_email: { tenantId: id, email: `owner@${t.slug}.test` } },
      create: {
        email: `owner@${t.slug}.test`,
        passwordHash,
        name: t.owner,
        role: 'TENANT_OWNER',
        tenantId: id,
      },
      // Names are updated too, so re-running the seed corrects existing rows.
      update: { passwordHash, name: t.owner },
    });

    await controlDb.staffUser.upsert({
      where: { tenantId_email: { tenantId: id, email: `catalog@${t.slug}.test` } },
      create: {
        email: `catalog@${t.slug}.test`,
        passwordHash,
        name: t.catalogManager,
        role: 'CATALOG_MANAGER',
        tenantId: id,
      },
      update: { passwordHash, name: t.catalogManager },
    });

    await seedTenantData(databaseUrl);
    logger.info({ slug: t.slug }, 'tenant seeded');
  }

  // One store starts suspended so the console has a non-happy-path row.
  await controlDb.tenant.update({ where: { slug: 'torquelab' }, data: { status: 'SUSPENDED' } });

  await seedPlatformOps(platformAdmin.id);

  logger.info('--------------------------------------------------');
  logger.info('Seed complete. Demo logins (password below):');
  logger.info('  platform     admin@treadcart.test');
  for (const t of tenants) {
    logger.info(`  ${t.slug.padEnd(12)} owner@${t.slug}.test | catalog@${t.slug}.test`);
  }
  logger.info(`  password: ${DEMO_PASSWORD}`);
  logger.info('--------------------------------------------------');
}

main()
  .then(() => controlDb.$disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error({ err }, 'seed failed');
    await controlDb.$disconnect().catch(() => undefined);
    process.exit(1);
  });
