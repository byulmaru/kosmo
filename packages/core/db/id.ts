import type * as Tables from './tables';

export const TableDiscriminator = {
  Accounts: 0x001,
  AccountProfiles: 0x002,
  Applications: 0x003,
  Posts: 0x004,
  PostContents: 0x005,
  Profiles: 0x006,
  ProfileFollows: 0x007,
  Sessions: 0x008,
} as const satisfies Record<keyof typeof Tables, number>;

let lastTimestamp = 0;
let sequence = crypto.getRandomValues(new Uint16Array(1))[0]!;

const assertTableDiscriminator = (tableDiscriminator: number) => {
  if (
    !Number.isInteger(tableDiscriminator) ||
    tableDiscriminator < 0 ||
    tableDiscriminator > 0xfff
  ) {
    throw new RangeError('tableDiscriminator must fit in 12 bits');
  }
};

const nextSequence = (timestamp: number) => {
  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1) & 0xffff;
  } else {
    lastTimestamp = timestamp;
    sequence = crypto.getRandomValues(new Uint16Array(1))[0]!;
  }

  return sequence;
};

const randomBits = (bitLength: bigint) => {
  const byteLength = Number((bitLength + 7n) / 8n);
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  const mask = (1n << bitLength) - 1n;

  return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n) & mask;
};

const formatUuid = (bytes: Uint8Array) => {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const createId = (
  tableDiscriminator: (typeof TableDiscriminator)[keyof typeof TableDiscriminator],
) => {
  assertTableDiscriminator(tableDiscriminator);

  const timestamp = Date.now();
  const bytes = new Uint8Array(16);

  bytes[0] = (timestamp / 0x10000000000) & 0xff;
  bytes[1] = (timestamp / 0x100000000) & 0xff;
  bytes[2] = (timestamp / 0x1000000) & 0xff;
  bytes[3] = (timestamp / 0x10000) & 0xff;
  bytes[4] = (timestamp / 0x100) & 0xff;
  bytes[5] = timestamp & 0xff;

  bytes[6] = 0x80 | (tableDiscriminator >> 8);
  bytes[7] = tableDiscriminator & 0xff;

  const customC = (BigInt(nextSequence(timestamp)) << 46n) | randomBits(46n);
  bytes[8] = 0x80 | Number((customC >> 56n) & 0x3fn);

  for (let index = 9; index < bytes.length; index += 1) {
    const shift = BigInt((15 - index) * 8);

    bytes[index] = Number((customC >> shift) & 0xffn);
  }

  return formatUuid(bytes);
};
