import './test';

export const cronMap = new Map<
  string,
  {
    pattern: string;
    fn: () => Promise<void>;
  }
>();

export const defineCron = (name: string, pattern: string, fn: () => Promise<void>) => {
  cronMap.set(name, { pattern, fn });
};
