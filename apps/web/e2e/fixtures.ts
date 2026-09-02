import { expect, test as base } from '@playwright/test';
import { closeE2EDatabase } from './db-fixtures';

type E2EWorkerFixtures = {
  e2eDatabase: void;
};

type E2ETestFixtures = {
  browserProfile: void;
};

export const test = base.extend<E2ETestFixtures, E2EWorkerFixtures>({
  browserProfile: [
    async ({ context }, use) => {
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
        const userAgentData = navigator.userAgentData;
        const brands = userAgentData?.brands.map(({ brand, version }) => ({
          brand: brand.replace('HeadlessChrome', 'Google Chrome'),
          version,
        }));
        if (userAgentData && brands) {
          const browserUserAgentData = new Proxy(userAgentData, {
            get(target, property) {
              if (property === 'brands') {
                return brands;
              }

              const value = Reflect.get(target, property, target) as unknown;
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
          Object.defineProperty(Navigator.prototype, 'userAgentData', {
            get: () => browserUserAgentData,
          });
        }
      });
      await use();
    },
    { auto: true },
  ],
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
