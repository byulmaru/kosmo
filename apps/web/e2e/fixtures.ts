import { expect, test as base } from '@playwright/test';
import { closeE2EDatabase } from './db-fixtures';

type E2EWorkerFixtures = {
  e2eDatabase: void;
};

export const test = base.extend<Record<string, never>, E2EWorkerFixtures>({
  e2eDatabase: [
    async ({ browserName }, use) => {
      void browserName;
      await use();
      await closeE2EDatabase();
    },
    { auto: true, scope: 'worker' },
  ],
});

export { expect };
