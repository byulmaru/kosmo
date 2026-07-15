const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const graphQLNamePattern = /^[_A-Za-z][_0-9A-Za-z]*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const invalidGlobalId = () => new Error('Invalid global ID');

const uuidToBuffer = (id: string) => {
  if (!uuidPattern.test(id)) {
    throw invalidGlobalId();
  }

  return Buffer.from(id.replaceAll('-', ''), 'hex');
};

const bufferToUuid = (value: Buffer) => {
  const hex = value.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const encodeGlobalId = (typename: string, id: bigint | number | string) => {
  if (!graphQLNamePattern.test(typename)) {
    throw invalidGlobalId();
  }

  return Buffer.concat([uuidToBuffer(String(id)), Buffer.from(typename, 'ascii')]).toString(
    'base64url',
  );
};

export const decodeGlobalId = (globalId: string) => {
  if (!base64UrlPattern.test(globalId)) {
    throw invalidGlobalId();
  }

  const value = Buffer.from(globalId, 'base64url');

  if (value.toString('base64url') !== globalId || value.length <= 16) {
    throw invalidGlobalId();
  }

  const typenameBytes = value.subarray(16);

  if (typenameBytes.some((byte) => byte > 0x7f)) {
    throw invalidGlobalId();
  }

  const typename = typenameBytes.toString('ascii');

  if (!graphQLNamePattern.test(typename)) {
    throw invalidGlobalId();
  }

  return {
    id: bufferToUuid(value.subarray(0, 16)),
    typename,
  };
};
