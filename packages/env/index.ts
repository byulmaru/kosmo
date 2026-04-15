import { z } from 'zod';

const schema = z.object({});

export const env = schema.parse(process.env);
export const stack = process.env.STACK ?? 'dev';
export const dev = process.env.NODE_ENV !== 'production';
