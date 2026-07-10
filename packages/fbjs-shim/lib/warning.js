const format = require('./format');

module.exports = function warning(condition, message, ...values) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (message === undefined) {
    throw new Error('`warning(condition, format, ...args)` requires a warning message argument');
  }

  if (!condition) {
    console.error(`Warning: ${format(message, values)}`);
  }
};
