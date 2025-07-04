import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string(),
  LISTEN_PORT: z.number().optional(),
});

export const env = schema.parse(process.env);
export const dev = process.env.NODE_ENV !== 'production';
