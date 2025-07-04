export const parseNullableJSON = <T>(value: string | null): T | null => {
  if (value === null) {
    return null;
  }

  return JSON.parse(value);
};
