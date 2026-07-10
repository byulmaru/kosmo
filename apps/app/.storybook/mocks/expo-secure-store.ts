const values = new Map<string, string>();

export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY';

export const deleteItemAsync = async (key: string) => {
  values.delete(key);
};

export const getItemAsync = async (key: string) => values.get(key) ?? null;

export const isAvailableAsync = async () => true;

export const setItemAsync = async (key: string, value: string) => {
  values.set(key, value);
};
