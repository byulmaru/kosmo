import { ValidationError } from '@kosmo/core/error';
import { parse as parseUuid } from 'uuid';

export type TimestampIdCursor = {
  readonly createdAt: Temporal.Instant;
  readonly id: string;
};

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

export const encodeTimestampIdCursor = ({ createdAt, id }: TimestampIdCursor): string =>
  Buffer.from(JSON.stringify([createdAt.toString(), id])).toString('base64url');

export const decodeTimestampIdCursor = (
  cursor: string,
  errorMessage: string,
): TimestampIdCursor => {
  try {
    if (!base64UrlPattern.test(cursor)) {
      throw new Error('Invalid base64url');
    }

    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) {
      throw new Error('Non-canonical base64url');
    }

    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== 'string' ||
      typeof value[1] !== 'string'
    ) {
      throw new Error('Invalid cursor payload');
    }

    const [createdAt, id] = value;
    parseUuid(id);

    return { createdAt: Temporal.Instant.from(createdAt), id };
  } catch {
    throw new ValidationError(errorMessage);
  }
};
