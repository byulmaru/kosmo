import { GraphQLError } from 'graphql';
import { decodeTime } from 'ulidx';

class DBNotFoundError extends GraphQLError {
  constructor() {
    super('Not Found', { extensions: { type: 'NotFoundError', code: 'NOT_FOUND', status: 404 } });
  }
}

export const first = <T>(arr: T[]): T | undefined => arr[0];
export const firstOrThrow = <T>(arr: T[]): T => {
  if (arr.length === 0) {
    throw new DBNotFoundError();
  }

  return arr[0];
};

export const firstOrThrowWith = (errorThrower: () => unknown) => {
  return <T>(arr: T[]): T => {
    if (arr.length === 0) {
      throw errorThrower();
    }

    return arr[0];
  };
};

export const idToTimestamp = (id: string) => {
  return decodeTime(id.split('0', 2)[1]);
};
