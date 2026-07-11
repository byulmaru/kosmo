import '@sun-typeface/suit/fonts/variable/woff2/SUIT-Variable.css';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './preview.css';

import { Suspense } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RouterMockProvider } from './mocks/expo-router';
import { RelayStoryProvider } from './mocks/react-relay';
import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const router = context.parameters.router ?? {};
      const relay = context.parameters.relay ?? {};

      return (
        <SafeAreaProvider>
          <ThemeProvider>
            <RelayStoryProvider
              mutationError={relay.mutationError}
              mutationGraphQLErrors={relay.mutationGraphQLErrors}
              mutationLoading={relay.mutationLoading}
              mutationResponse={relay.mutationResponse}
              paginationError={relay.paginationError}
              paginationLoading={relay.paginationLoading}
              paginationResponse={relay.paginationResponse}
              queryData={relay.data}
            >
              <RouterMockProvider
                params={router.params}
                pathname={router.pathname}
                slotLabel={router.slotLabel}
              >
                <Suspense
                  fallback={
                    <View style={{ padding: 24 }}>
                      <Text>스토리를 불러오는 중입니다.</Text>
                    </View>
                  }
                >
                  <View style={{ flex: 1, minHeight: '100%', width: '100%' }}>
                    <Story />
                  </View>
                </Suspense>
              </RouterMockProvider>
            </RelayStoryProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      );
    },
  ],
  initialGlobals: { backgrounds: { value: 'kosmoLight' } },
  parameters: {
    a11y: {
      // Preserve the existing Svelte/Figma #777 secondary-text token in this migration.
      // Its contrast debt is separate from the semantic accessibility parity checked here.
      config: { rules: [{ enabled: false, id: 'color-contrast' }] },
      test: 'error',
    },
    backgrounds: {
      options: {
        kosmoDark: { name: 'KOSMO Dark', value: '#111111' },
        kosmoLight: { name: 'KOSMO Light', value: '#ffffff' },
        kosmoSurface: { name: 'KOSMO Surface', value: '#f6f6f6' },
      },
    },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    layout: 'padded',
    viewport: {
      options: {
        kosmoCompact: {
          name: 'KOSMO compact',
          styles: { height: '900px', width: '900px' },
          type: 'tablet',
        },
        kosmoFull: {
          name: 'KOSMO full',
          styles: { height: '900px', width: '1400px' },
          type: 'desktop',
        },
        kosmoMobile: {
          name: 'KOSMO mobile',
          styles: { height: '844px', width: '390px' },
          type: 'mobile',
        },
      },
    },
  },
};

export default preview;
