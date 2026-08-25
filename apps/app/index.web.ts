import '@expo/metro-runtime';

import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { createElement } from 'react';
import { initializeAnalytics } from './src/analytics/client';
import { captureReactError, initializeBrowserSentry } from './src/observability/sentry-browser';
import { loadRuntimeConfig } from './src/runtimeConfig';

async function bootstrap(): Promise<void> {
  try {
    const runtimeConfig = await loadRuntimeConfig();
    initializeBrowserSentry(runtimeConfig);
    initializeAnalytics(runtimeConfig.openPanelClientId);

    const [{ App }, { UnexpectedErrorContext }] = await Promise.all([
      import('expo-router/build/qualified-entry'),
      import('./src/observability/UnexpectedErrorContext'),
    ]);
    const WebApp = () =>
      createElement(
        UnexpectedErrorContext.Provider,
        { value: captureReactError },
        createElement(App),
      );

    renderRootComponent(WebApp);
  } catch (cause) {
    console.error('Web runtime config bootstrap failed', cause);
    const root = document.getElementById('root') ?? document.body;
    root.innerHTML = `
      <main style="display:grid;place-content:center;min-height:100vh;text-align:center;font-family:system-ui,sans-serif">
        <h1>KOSMO를 불러오지 못했어요</h1>
        <p>환경 설정을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.</p>
        <button type="button">다시 시도</button>
      </main>`;
    const retry = root.querySelector('button');
    retry?.addEventListener('click', () => {
      retry.disabled = true;
      void bootstrap();
    });
  }
}

void bootstrap();
