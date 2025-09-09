import tlds from 'tlds';
import { z } from 'zod';

type PathSegment = {
  key: PropertyKey;
};

export const stringifyPath = (path: readonly (PropertyKey | PathSegment)[]) =>
  path
    .map((p) => (typeof p === 'number' ? `[${p}]` : `.${p.toString()}`))
    .join('')
    .slice(1);

export const handle = z
  .string()
  .min(3, 'error.handle.min')
  .max(30, 'error.handle.max')
  .regex(/^[a-zA-Z0-9_]+$/, 'error.handle.regex')
  .refine((str) => !str.startsWith('_') && !str.endsWith('_'), 'error.handle.startsOrEndsWith')
  .refine((str) => !str.includes('__'), 'error.handle.continuousUnderscores')
  .refine((str) => !tlds.includes(str.toLowerCase()), 'error.handle.notAllowed');

export const postContent = z
  .string()
  .min(1, 'error.post.content.min')
  .max(500, 'error.post.content.max');
