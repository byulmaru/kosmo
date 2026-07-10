module.exports = function format(message, values) {
  let index = 0;

  return message.replace(/%s/g, () => String(values[index++]));
};
