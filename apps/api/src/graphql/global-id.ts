import { parse as parseUuid, stringify as stringifyUuid } from 'uuid';

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const invalidGlobalId = () => new Error('Invalid global ID');

const uuidToBuffer = (id: string) => {
  try {
    return Buffer.from(parseUuid(id));
  } catch {
    throw invalidGlobalId();
  }
};

const bufferToUuid = (value: Buffer) => {
  try {
    return stringifyUuid(value);
  } catch {
    throw invalidGlobalId();
  }
};

export const encodeGlobalId = (typename: string, id: bigint | number | string) => {
  return Buffer.concat([uuidToBuffer(String(id)), Buffer.from(typename, 'ascii')]).toString(
    'base64url',
  );
};

export const decodeGlobalId = (globalId: string) => {
  if (!base64UrlPattern.test(globalId)) {
    throw invalidGlobalId();
  }

  const value = Buffer.from(globalId, 'base64url');

  return {
    id: bufferToUuid(value.subarray(0, 16)),
    typename: value.subarray(16).toString('utf8'),
  };
};
