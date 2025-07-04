import tlds from 'tlds';
import z from 'zod';

export const handle = z
  .string()
  .min(3, 'error.handle.min')
  .max(30, 'error.handle.max')
  .regex(/^[a-zA-Z0-9-]+$/, 'error.handle.regex')
  .refine((str) => !str.startsWith('-') && !str.endsWith('-'), 'error.handle.startsOrEndsWith')
  .refine((str) => str.substring(2, 4) !== '--', 'error.handle.notAllowed')
  .refine((str) => !tlds.includes(str.toLowerCase()), 'error.handle.notAllowed');
