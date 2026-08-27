const encodedWordPattern = /=\?([^?]+)\?([bq])\?([^?]*)\?=/giu;
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

function decodeEncodedWord(charset: string, encoding: string, value: string): string | undefined {
  if (charset.toLowerCase() !== 'utf-8') {
    return undefined;
  }

  const bytes = encoding.toLowerCase() === 'b' ? decodeBase64(value) : decodeQuotedPrintable(value);
  if (!bytes) {
    return undefined;
  }

  try {
    return utf8Decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

function isDisplayText(value: string): boolean {
  if (!value) {
    return false;
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x1f || codePoint === 0x7f) {
      return false;
    }
  }

  try {
    return utf8Decoder.decode(utf8Encoder.encode(value)) === value;
  } catch {
    return false;
  }
}

export function normalizeIdentityHeader(value: string | undefined): string | undefined {
  const input = value?.trim();
  if (!input) {
    return undefined;
  }

  if (!input.includes('=?')) {
    return isDisplayText(input) ? input : undefined;
  }

  let cursor = 0;
  let decoded = '';
  let matched = false;

  for (const match of input.matchAll(encodedWordPattern)) {
    const [encodedWord, charset, encoding, contents] = match;
    const index = match.index;
    if (index === undefined) {
      return undefined;
    }

    const prefix = input.slice(cursor, index);
    if (matched && /^\s+$/u.test(prefix)) {
      decoded += '';
    } else {
      decoded += prefix;
    }

    const word = decodeEncodedWord(charset, encoding, contents);
    if (word === undefined) {
      return undefined;
    }
    decoded += word;
    cursor = index + encodedWord.length;
    matched = true;
  }

  decoded += input.slice(cursor);
  const normalized = decoded.trim();
  if (!matched || normalized.includes('=?') || !isDisplayText(normalized)) {
    return undefined;
  }

  return normalized;
}
