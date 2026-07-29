import { z } from 'zod';

export type NormalizedProfileTag = {
  readonly name: string;
  readonly displayName: string;
};

const profileTagNamePattern = /^[\p{Letter}\p{Number}_]+$/u;

export const normalizeProfileTagDisplayName = (value: string): string =>
  value.trim().replace(/^#/, '').normalize('NFKC');

export const normalizeProfileTagName = (value: string): string =>
  normalizeProfileTagDisplayName(value).toLowerCase();

export const profileTagNameSchema = z.string().transform((value, context) => {
  const name = normalizeProfileTagName(value);

  if (name.length === 0 || [...name].length > 20 || !profileTagNamePattern.test(name)) {
    context.addIssue({
      code: 'custom',
      message: 'Profile Tag는 1~20자의 문자, 숫자 또는 밑줄만 사용할 수 있어요.',
    });
    return z.NEVER;
  }

  return name;
});

const normalizedProfileTagSchema = z.string().transform((value, context): NormalizedProfileTag => {
  const result = profileTagNameSchema.safeParse(value);
  if (!result.success) {
    for (const issue of result.error.issues) {
      context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
    return z.NEVER;
  }

  return {
    name: result.data,
    displayName: normalizeProfileTagDisplayName(value),
  };
});

export const profileTagsSchema = z
  .array(normalizedProfileTagSchema)
  .superRefine((tags, context) => {
    const seen = new Set<string>();

    tags.forEach(({ name }, index) => {
      if (seen.has(name)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: '정규화한 Profile Tag는 중복될 수 없어요.',
        });
      } else {
        seen.add(name);
      }
    });
  });

const profileTagsInputListSchema = z.array(z.string()).superRefine((tags, context) => {
  const result = profileTagsSchema.safeParse(tags);
  if (!result.success) {
    for (const issue of result.error.issues) {
      context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
  }
});

export const profileTagsInputSchema = profileTagsInputListSchema.nullable().optional();
