import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  WEB_ORIGIN: z.string().url(),
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_POOL_SIZE: z.coerce.number().default(10),
  JWT_SECRET: z.string().min(32),
  CAMPUS_TZ: z.string().default('Asia/Kolkata'),
  CHECKIN_INTERVAL_MIN: z.coerce.number().int().min(1).default(10),
  // true: SOS always alerts campus security as well as contacts (matches the prototype's on-screen copy).
  SOS_ALWAYS_NOTIFY_SECURITY: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  CAMPUS_SECURITY_PHONE: z.string().optional().transform((v) => v || undefined),
  CAMPUS_SECURITY_EMAIL: z.string().optional().transform((v) => v || undefined),
});

export const env = schema.parse(process.env);
