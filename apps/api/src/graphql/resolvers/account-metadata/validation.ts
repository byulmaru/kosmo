import { z } from 'zod';

export const accountMetadataKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

export const accountMetadataKeysSchema = z.array(accountMetadataKeySchema).min(1).max(32);

export const accountMetadataValueSchema = z
  .string()
  .refine((value) => !value.includes('\u0000'))
  .refine((value) => new TextEncoder().encode(value).byteLength <= 4096);
