import { z } from 'zod';
import { defineJob } from './registry';

export const smokeJob = defineJob({
  payloadSchema: z.object({
    message: z.string().min(1).default('ok'),
  }),
  subject: 'smoke',
  type: 'smoke',
});
