import { z } from 'zod';

const schema = z.object({
  REDIS_URL: z.string(),
});

export const env = schema.parse(process.env);
