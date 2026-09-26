/**
 * Seeds a working local environment:
 *   - control plane schema + a platform admin
 *   - two tenants, each with its own database
 *   - staff users, brands, tire & wheel SKUs, inventory,
 *     customer groups with SKU-level pricing, and vehicle fitments
 *
 *   pnpm seed
 */
import { hash as hashPassword } from '@node-rs/argon2';
import { PrismaClient as TenantPrismaClient } from '../generated/tenant/index.js';
import { controlDb } from '../db/control.js';
import { provisionTenant } from './provision-tenant.js';
import { logger } from '../lib/logger.js';

const DEMO_PASSWORD = 'Treadcart!2345';

async function seedTenantData(databaseUrl: string, flavour: 'tires' | 'wheels'): Promise<void> {
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

    const brandName = flavour === 'tires' ? 'Meridian' : 'Volk Forged';
    const brand = await db.brand.upsert({
      where: { slug: brandName.toLowerCase().replace(/\s+/g, '-') },
      create: { name: brandName, slug: brandName.toLowerCase().replace(/\s+/g, '-') },
      update: {},
    });

    const vehicle = await db.vehicle.upsert({
      where: { year_make_model_trim: { year: 2021, make: 'Honda', model: 'Civic', trim: 'Sport' } },
      create: { year: 2021, make: 'Honda', model: 'Civic', trim: 'Sport' },
      update: {},
    });

    // One shape for both flavours: `w` is section width in mm for tires and
    // wheel width in inches for wheels, and the rest are populated per type.
    interface Spec {
      size: string;
      w: number;
      r: number;
      price: number;
      a?: number;
      load?: number;
      speed?: 'H' | 'V' | 'W';
      bolt?: string;
      offset?: number;
    }

    const specs: Spec[] =
      flavour === 'tires'
        ? [
            { size: '225/45R17', w: 225, a: 45, r: 17, price: 18900, load: 94, speed: 'V' },
            { size: '235/40R18', w: 235, a: 40, r: 18, price: 21400, load: 95, speed: 'W' },
            { size: '205/55R16', w: 205, a: 55, r: 16, price: 14200, load: 91, speed: 'H' },
          ]
        : [
            { size: '17x7.5 +45', w: 7.5, r: 17, price: 32900, bolt: '5x114.3', offset: 45 },
            { size: '18x8.5 +35', w: 8.5, r: 18, price: 41900, bolt: '5x114.3', offset: 35 },
          ];

    for (const [i, spec] of specs.entries()) {
      const isTire = flavour === 'tires';
      const slug = `${brand.slug}-${spec.size.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

      const product = await db.product.upsert({
        where: { slug },
        create: {
          slug,
          name: `${brand.name} ${isTire ? 'GT Sport' : 'TE-F'} ${spec.size}`,
          type: isTire ? 'TIRE' : 'WHEEL',
          brandId: brand.id,
          description: isTire
            ? 'Ultra-high-performance all-season with an asymmetric tread.'
            : 'Flow-formed monoblock wheel, gloss black.',
        },
        update: {},
      });

      const skuCode = `${brand.slug.toUpperCase().slice(0, 3)}-${spec.size.replace(/[^A-Z0-9]+/gi, '')}`;
      const sku = await db.sku.upsert({
        where: { sku: skuCode },
        create: {
          sku: skuCode,
          productId: product.id,
          basePriceCents: spec.price,
          compareAtCents: spec.price + 3000,
          weightGrams: isTire ? 10500 : 9800,
          ...(isTire
            ? {
                sectionWidthMm: spec.w,
                aspectRatio: spec.a,
                rimDiameterIn: spec.r,
                loadIndex: spec.load,
                speedRating: spec.speed,
                season: 'ALL_SEASON' as const,
                treadwear: 500,
              }
            : {
                wheelWidthIn: spec.w,
                rimDiameterIn: spec.r,
                boltPattern: spec.bolt,
                offsetMm: spec.offset,
                centerBoreMm: 64.1,
                finish: 'Gloss Black',
              }),
        },
        update: {},
      });

      await db.inventoryItem.upsert({
        where: { skuId: sku.id },
        create: { skuId: sku.id, onHand: 40 - i * 8, reorderAt: 8 },
        update: {},
      });

      await db.skuFitment.upsert({
        where: { skuId_vehicleId_position: { skuId: sku.id, vehicleId: vehicle.id, position: 'ALL' } },
        create: { skuId: sku.id, vehicleId: vehicle.id, position: 'ALL', isOem: i === 0 },
        update: {},
      });

      // SKU-level pricing: trade gets a fixed price, fleet a volume break at 4+.
      await db.customerGroupPrice.upsert({
        where: { groupId_skuId_minQuantity: { groupId: trade.id, skuId: sku.id, minQuantity: 1 } },
        create: {
          groupId: trade.id,
          skuId: sku.id,
          priceCents: Math.round(spec.price * 0.88),
          minQuantity: 1,
        },
        update: {},
      });
      await db.customerGroupPrice.upsert({
        where: { groupId_skuId_minQuantity: { groupId: fleet.id, skuId: sku.id, minQuantity: 4 } },
        create: { groupId: fleet.id, skuId: sku.id, discountBps: 1800, minQuantity: 4 },
        update: {},
      });
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
          // Update too, so re-running the seed corrects existing rows.
          update: { firstName: c.first, lastName: c.last, groupId: c.groupId },
        }),
      );
    }

    // Drop demo customers left behind by an earlier version of this seed, so
    // re-running it converges on exactly the list above.
    await db.customer.deleteMany({ where: { email: { notIn: customers.map((c) => c.email) } } });

    await seedOrders(db, created);
  } finally {
    await db.$disconnect();
  }
}

/** How many orders each store gets. Small enough that the lists stay readable. */
const ORDERS_PER_TENANT = 10;

/**
 * Spreads a handful of orders over the last 60 days, weighted towards the
 * recent half so the dashboard's month-over-month deltas are positive and the
 * trend line has shape.
 */
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
        number: `TC-${String(100_000 + i * 7 + Math.floor(Math.random() * 900))}`,
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

  // Demo content is rebuilt each run so edits to the fixtures below take
  // effect. Anything a reviewer typed into the console is thrown away with it.
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
        { fromStaff: true, author: 'Ahmed Raza', body: 'Sorry for the delay — I can see the refund was approved on the store side. Escalating to payments now.' },
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
        { fromStaff: true, author: 'Ahmed Raza', body: 'Apologies — arranging a pickup and a replacement at no charge.' },
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

  // The platform console operator. tenantId stays null: a platform admin is
  // deliberately not scoped to any one store.
  // Not an upsert: Postgres treats NULLs as distinct in a unique index, so
  // the (tenantId, email) key cannot match a row whose tenantId is null.
  const existingAdmin = await controlDb.staffUser.findFirst({
    where: { email: 'admin@treadcart.test', tenantId: null },
  });
  const platformAdmin = existingAdmin
    ? await controlDb.staffUser.update({
        where: { id: existingAdmin.id },
        data: { passwordHash, role: 'PLATFORM_ADMIN', name: 'Ahmed Raza' },
      })
    : await controlDb.staffUser.create({
        data: {
          email: 'admin@treadcart.test',
          passwordHash,
          name: 'Ahmed Raza',
          role: 'PLATFORM_ADMIN',
          tenantId: null,
        },
      });

  const tenants = [
    { slug: 'apexauto', name: 'Apex Auto', host: 'apexauto.localhost', flavour: 'tires' as const,
      brandPrimary: '#0F5132', brandAccent: '#84CC16',
      owner: 'Imran Qureshi', catalogManager: 'Sadia Nawaz' },
    { slug: 'wheelworks', name: 'WheelWorks', host: 'wheelworks.localhost', flavour: 'wheels' as const,
      brandPrimary: '#1E3A8A', brandAccent: '#38BDF8',
      owner: 'Tariq Mehmood', catalogManager: 'Mariam Aslam' },
    { slug: 'torquelab', name: 'Torque Lab', host: 'torquelab.localhost', flavour: 'wheels' as const,
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

    await seedTenantData(databaseUrl, t.flavour);
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
