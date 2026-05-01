/* eslint-disable @typescript-eslint/no-require-imports */

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

/** @type {import("expo/metro-config").MetroConfig} */
const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest(context, moduleName, platform) {
    if (moduleName === '$mearie') {
      return {
        filePath: path.join(__dirname, '.mearie', 'graphql.js'),
        type: 'sourceFile',
      };
    }

    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }

    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = withNativewind(config);
