// `@expo/metro-runtime` MUST be the first import to ensure Fast Refresh works.
import '@expo/metro-runtime';

import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { createElement } from 'react';
import { captureReactError } from './src/observability/sentry-native';
import { UnexpectedErrorContext } from './src/observability/UnexpectedErrorContext';

const NativeApp = () =>
  createElement(UnexpectedErrorContext.Provider, { value: captureReactError }, createElement(App));

renderRootComponent(NativeApp);
