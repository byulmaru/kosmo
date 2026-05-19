import { z } from 'zod';

export const profileHandleSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/);

export const profileDisplayNameSchema = z.string().trim().min(1).max(80);

export const profileBioSchema = z.string().trim().max(500).nullable();
