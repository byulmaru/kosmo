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

const assertTableDiscriminator = (tableDiscriminator: number) => {
  if (
    !Number.isInteger(tableDiscriminator) ||
    tableDiscriminator < 0 ||
    tableDiscriminator > 0xfff
  ) {
    throw new RangeError('tableDiscriminator must fit in 12 bits');
  }
};

const formatUuid = (bytes: Uint8Array) => {
  const hex = bytes.toHex();
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

  // 성능 최적화를 위해 9바이트 랜덤을 만든 후 첫 비트만 10으로 만들어줌
  crypto.getRandomValues(bytes.subarray(8));
  bytes[8] = 0x80 | (bytes[8] & 0x3f);

  return formatUuid(bytes);
};
