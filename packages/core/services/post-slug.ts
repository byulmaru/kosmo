import { isUniqueViolation } from '../db';
import type { Transaction } from '../db';

const maxPostSlugInsertAttempts = 5;

const isPostSlugCollision = (error: unknown) => {
  if (
    !isUniqueViolation(error) ||
    !error ||
    typeof error !== 'object' ||
    !('cause' in error) ||
    !error.cause ||
    typeof error.cause !== 'object' ||
    !('constraint_name' in error.cause)
  ) {
    return false;
  }

  return error.cause.constraint_name === 'post_slug_unique';
};

export const withPostSlugRetry = async <T>(
  transaction: Transaction,
  insert: (transaction: Transaction) => Promise<T>,
): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await transaction.transaction(insert);
    } catch (error) {
      if (attempt >= maxPostSlugInsertAttempts - 1 || !isPostSlugCollision(error)) {
        throw error;
      }
    }
  }
};
