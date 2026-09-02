import { z } from 'zod';

// ponytail: Tailscale currently sends one UTF-8 Q encoded word; add other encodings only if that wire contract changes.
const displayText = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/[\p{Cc}\p{Cs}]/u.test(value));
export function normalizeIdentityHeader(value: string | null | undefined): string | undefined {
  const input = displayText.safeParse(value);
  if (!input.success) {
    return undefined;
  }

  const match = input.data.match(/^=\?utf-8\?q\?([^?]*)\?=$/iu);
  if (!match) {
    return input.data.includes('=?') ? undefined : input.data;
  }

  const encoded = z
    .string()
    .regex(/^[!-~]*$/u)
    .safeParse(match[1]);
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
