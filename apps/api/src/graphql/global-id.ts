import { parse as parseUuid, stringify as stringifyUuid } from 'uuid';

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const invalidGlobalId = () => new Error('Invalid global ID');

export const encodeGlobalId = (typename: string, id: bigint | number | string) => {
  try {
    return Buffer.concat([
      Buffer.from(parseUuid(String(id))),
      Buffer.from(typename, 'ascii'),
    ]).toString('base64url');
  } catch {
    throw invalidGlobalId();
  }
};

export const decodeGlobalId = (globalId: string) => {
  if (!base64UrlPattern.test(globalId)) {
    throw invalidGlobalId();
  }

  const value = Buffer.from(globalId, 'base64url');

  try {
    return {
      id: stringifyUuid(value.subarray(0, 16)),
      typename: value.subarray(16).toString('utf8'),
    };
  } catch {
    throw invalidGlobalId();
  }
};
