/*
 * Copyright (c) 2013-present, Facebook, Inc.
 * Licensed under the MIT license in ../LICENSE.
 */

const objectToString = Object.prototype.toString;
const hasOwn = Object.prototype.hasOwnProperty;

function equal(a, b, aStack, bStack) {
  if (a === b) {
    return a !== 0 || 1 / a === 1 / b;
  }

  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  const className = objectToString.call(a);
  if (className !== objectToString.call(b)) {
    return false;
  }

  if (className === '[object String]') {
    return String(a) === String(b);
  }
  if (className === '[object Number]') {
    return !Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && Number(a) === Number(b);
  }
  if (className === '[object Date]' || className === '[object Boolean]') {
    return Number(a) === Number(b);
  }
  if (className === '[object RegExp]') {
    return (
      a.source === b.source &&
      a.global === b.global &&
      a.multiline === b.multiline &&
      a.ignoreCase === b.ignoreCase
    );
  }

  for (let index = aStack.length - 1; index >= 0; index -= 1) {
    if (aStack[index] === a) {
      return bStack[index] === b;
    }
  }

  aStack.push(a);
  bStack.push(b);

  if (className === '[object Array]') {
    if (a.length !== b.length) {
      return false;
    }
    for (let index = a.length - 1; index >= 0; index -= 1) {
      if (!equal(a[index], b[index], aStack, bStack)) {
        return false;
      }
    }
  }
  else {
    if (a.constructor !== b.constructor) {
      return false;
    }
    if (hasOwn.call(a, 'valueOf') && hasOwn.call(b, 'valueOf')) {
      return a.valueOf() === b.valueOf();
    }

    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) {
      return false;
    }
    for (const key of keys) {
      if (!equal(a[key], b[key], aStack, bStack)) {
        return false;
      }
    }
  }

  aStack.pop();
  bStack.pop();
  return true;
}

module.exports = function areEqual(a, b) {
  return equal(a, b, [], []);
};
