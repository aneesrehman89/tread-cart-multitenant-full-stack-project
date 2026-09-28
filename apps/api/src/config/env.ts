import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { resolve } from 'node:path';

// The .env lives at the repo root so every app in the workspace shares it.
loadDotenv({ path: resolve(process.cwd(), '../../.env') });
loadDotenv();

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  CONTROL_DATABASE_URL: z.string().url(),

  TENANT_DB_ADMIN_URL: z.string().url(),
  TENANT_DB_HOST: z.string().default('localhost'),
  TENANT_DB_PORT: z.coerce.number().int().positive().default(5433),
  TENANT_DB_USER: z.string(),
  TENANT_DB_PASSWORD: z.string(),
  TENANT_POOL_MAX_CLIENTS: z.coerce.number().int().positive().default(25),
  TENANT_POOL_IDLE_MS: z.coerce.number().int().positive().default(300_000),

  REDIS_URL: z.string().url(),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  AUTH_TOKEN_PEPPER: z.string().min(32, 'AUTH_TOKEN_PEPPER must be at least 32 chars'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  CHECKOUT_SIGNING_SECRET: z.string().min(16),

  // --- OAuth ---
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z
    .string()
    .default('http://localhost:4000/v1/seller/auth/google/callback'),
  // Second redirect URI on the same OAuth client, for shoppers.
  GOOGLE_CUSTOMER_REDIRECT_URI: z
    .string()
    .default('http://localhost:4000/v1/customer/auth/google/callback'),

  // Where to bounce browsers back to after an external redirect.
  SELLER_APP_URL: z.string().default('http://localhost:3001'),
  STOREFRONT_URL: z.string().default('http://localhost:3000'),

  // --- Email: set a Resend key or SMTP; with neither, codes are logged ---
  RESEND_API_KEY: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  MAIL_FROM: z.string().default('TreadCart <onboarding@resend.dev>'),

  // --- SMS (Twilio) ---
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_FROM_NUMBER: z.string().default(''),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default('false'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // Fail loudly at boot rather than at the first request that needs the value.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
