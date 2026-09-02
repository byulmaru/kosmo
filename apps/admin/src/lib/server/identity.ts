import { z } from 'zod';

// ponytail: Tailscale currently sends one UTF-8 Q encoded word; add other encodings only if that wire contract changes.
const encodedWordPattern = /^=\?utf-8\?q\?([^?]*)\?=$/iu;
const displayText = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/[\p{Cc}\p{Cs}]/u.test(value));
const qEncodedText = z.string().regex(/^[!-~]*$/u);

export function normalizeIdentityHeader(value: string | null | undefined): string | undefined {
  const input = displayText.safeParse(value);
  if (!input.success) {
    return undefined;
  }

  const match = encodedWordPattern.exec(input.data);
  if (!match) {
    return input.data.includes('=?') ? undefined : input.data;
  }

  const encoded = qEncodedText.safeParse(match[1] ?? '');
  if (!encoded.success || /=(?![0-9a-f]{2})/iu.test(encoded.data)) {
    return undefined;
  }

  try {
    return displayText.parse(
      decodeURIComponent(
        encoded.data
          .replace(/%/g, '%25')
          .replace(/=([0-9a-f]{2})/giu, '%$1')
          .replace(/_/g, ' '),
      ),
    );
  } catch {
    return undefined;
  }
}
