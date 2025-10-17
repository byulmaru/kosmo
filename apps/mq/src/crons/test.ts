import { defineCron } from '../types';

export const TestCron = defineCron('test', '0 0 * * *', async () => {
  // do something
});
