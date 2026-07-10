const format = require('./format');

module.exports = function invariant(condition, message, ...values) {
  if (process.env.NODE_ENV !== 'production' && message === undefined) {
    throw new Error('invariant(...): Second argument must be a string.');
  }

  if (condition) {
    return;
  }

  const error = new Error(
    message === undefined
      ? 'Minified exception occurred; use the non-minified dev environment for the full error message.'
      : format(message, values),
  );
  if (message !== undefined) {
    error.name = 'Invariant Violation';
  }
  error.framesToPop = 1;

  throw error;
};
