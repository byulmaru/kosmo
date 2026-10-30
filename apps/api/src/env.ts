import { z } from 'zod';

export const envSchema = z.object({
  KOSMO_LOCAL_TIMELINE_INSTANCE_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((instanceId) => instanceId.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.uuid())),
});

export const env = envSchema.parse(process.env);
