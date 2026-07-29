import '@expo/metro-runtime';

import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { createElement } from 'react';
import { captureReactError } from './src/observability/sentry-browser';
import { UnexpectedErrorContext } from './src/observability/UnexpectedErrorContext';

const WebApp = () =>
  createElement(UnexpectedErrorContext.Provider, { value: captureReactError }, createElement(App));

renderRootComponent(WebApp);
