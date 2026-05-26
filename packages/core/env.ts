import { z } from 'zod';

const envSchema = z.object({
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ENDPOINT: z.url(),
  R2_PUBLIC_BASE_URL: z.url(),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
