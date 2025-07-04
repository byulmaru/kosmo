import { pgEnum, type PgEnum } from 'drizzle-orm/pg-core';
import * as E from '../../enums';

type ValueOf<T> = T[keyof T];

type Enum<T extends string> = PgEnum<[T, ...T[]]>;

type Enums = {
  -readonly [K in keyof typeof E]: ValueOf<(typeof E)[K]> extends string
    ? Enum<ValueOf<(typeof E)[K]>>
    : never;
};

function createPgEnum<T extends string>(enumName: string, obj: Record<string, T>) {
  return pgEnum(enumName, Object.values(obj) as [T, ...T[]]);
}

export const pgEnums = Object.entries(E).reduce((acc, [key, value]) => {
  acc[key] = createPgEnum(key, value);
  return acc;
}, {} as any) as Enums;
