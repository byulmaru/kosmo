export type CronFn = () => Promise<void>;

export type CronSpec = {
  name: string;
  pattern: string;
  fn: CronFn;
};

export const defineCron = (name: string, pattern: string, fn: CronFn): CronSpec => {
  return { name, pattern, fn };
};
