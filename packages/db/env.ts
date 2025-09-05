import { z } from 'zod';

export const schema = z.object({
  DATABASE_URL: z.string(),
});

export const env = schema.parse(process.env);
