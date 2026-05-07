import { TableDiscriminator } from '@kosmo/core/db';

export const globalIdMap = new Map<number, string>();

export const registerGlobalId = (object: { name: string; tableName: string }) => {
  globalIdMap.set(
    TableDiscriminator[object.tableName as keyof typeof TableDiscriminator],
    object.name,
  );
};
