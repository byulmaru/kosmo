// ponytail: Tailscale uses one UTF-8 B/Q encoded word; add multi-word decoding if that wire contract changes.
const encodedWordPattern = /^=\?([^?]+)\?([bq])\?([^?]*)\?=$/iu;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const utf8Encoder = new TextEncoder();

function decodeBase64(value: string): Uint8Array | undefined {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return undefined;
  }

  return Buffer.from(value, 'base64');
}

function decodeQuotedPrintable(value: string): Uint8Array | undefined {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '_') {
      bytes.push(0x20);
      continue;
    }
    if (character === '=') {
      const pair = value.slice(index + 1, index + 3);
      if (!/^[0-9a-f]{2}$/iu.test(pair)) {
        return undefined;
      }
      bytes.push(Number.parseInt(pair, 16));
      index += 2;
      continue;
    }

    const codePoint = character?.codePointAt(0);
    if (codePoint === undefined || codePoint > 0x7f) {
      return undefined;
    }
    bytes.push(codePoint);
  }

  return Uint8Array.from(bytes);
}

function isDisplayText(value: string): boolean {
  return (
    Boolean(value) &&
    !/\p{Cc}/u.test(value) &&
    utf8Decoder.decode(utf8Encoder.encode(value)) === value
  );
}

export function normalizeIdentityHeader(value: string | undefined): string | undefined {
  const input = value?.trim();
  if (!input) {
    return undefined;
  }

  const match = encodedWordPattern.exec(input);
  if (!match) {
    return input.includes('=?') || !isDisplayText(input) ? undefined : input;
  }

  const [, charset, encoding, contents] = match;
  if (charset?.toLowerCase() !== 'utf-8') {
    return undefined;
  }

  const bytes =
    encoding?.toLowerCase() === 'b'
      ? decodeBase64(contents ?? '')
      : decodeQuotedPrintable(contents ?? '');
  if (!bytes) {
    return undefined;
  }

  try {
    const decoded = utf8Decoder.decode(bytes).trim();
    return isDisplayText(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}
