export const first = <T>(arr: T[]): T | undefined => arr[0];
export const firstOrThrow = <T>(arr: T[]): T => {
  if (arr.length === 0) {
    throw new Error('Not Found');
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
