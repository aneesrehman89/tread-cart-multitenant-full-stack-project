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

    await db.customer.upsert({
      where: { email: 'trade@example.com' },
      create: {
        email: 'trade@example.com',
        firstName: 'Dana',
        lastName: 'Ortiz',
        groupId: trade.id,
      },
      update: {},
    });
    await db.customer.upsert({
      where: { email: 'retail@example.com' },
      create: { email: 'retail@example.com', firstName: 'Sam', lastName: 'Lee', groupId: retail.id },
      update: {},
    });
  } finally {
    await db.$disconnect();
  }
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const tenants = [
    { slug: 'apexauto', name: 'Apex Auto', host: 'apexauto.localhost', flavour: 'tires' as const },
    { slug: 'wheelworks', name: 'WheelWorks', host: 'wheelworks.localhost', flavour: 'wheels' as const },
  ];

  for (const t of tenants) {
    const { id, databaseUrl } = await provisionTenant({
      slug: t.slug,
      name: t.name,
      host: t.host,
    });

    await controlDb.staffUser.upsert({
      where: { tenantId_email: { tenantId: id, email: `owner@${t.slug}.test` } },
      create: {
        email: `owner@${t.slug}.test`,
        passwordHash,
        name: `${t.name} Owner`,
        role: 'TENANT_OWNER',
        tenantId: id,
      },
      update: { passwordHash },
    });

    await controlDb.staffUser.upsert({
      where: { tenantId_email: { tenantId: id, email: `catalog@${t.slug}.test` } },
      create: {
        email: `catalog@${t.slug}.test`,
        passwordHash,
        name: `${t.name} Catalog Manager`,
        role: 'CATALOG_MANAGER',
        tenantId: id,
      },
      update: { passwordHash },
    });

    await seedTenantData(databaseUrl, t.flavour);
    logger.info({ slug: t.slug }, 'tenant seeded');
  }

  logger.info('--------------------------------------------------');
  logger.info('Seed complete. Demo logins (password below):');
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
