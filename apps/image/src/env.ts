import { z } from 'zod';

const schema = z.object({
  S3_ENDPOINT: z.string(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
});

export const env = schema.parse(process.env);
