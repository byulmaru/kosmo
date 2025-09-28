import { z } from 'zod';

const schema = z.object({
  PUBLIC_IMAGE_DOMAIN: z.string(),
});

export const env = schema.parse(process.env);
