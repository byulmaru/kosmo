import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  PUBLIC_IMAGE_DOMAIN: z.string(),
  PUBLIC_WEB_DOMAIN: z.string(),
  S3_ENDPOINT: z.string(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
});

export const env = (process.env.NODE_ENV === 'build' ? {} : schema.parse(process.env)) as z.infer<typeof schema>;
