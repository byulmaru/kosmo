import '@sun-typeface/suit/fonts/variable/woff2/SUIT-Variable.css';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './preview.css';

import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
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
              mutationLoading={relay.mutationLoading}
              mutationResponse={relay.mutationResponse}
              queryData={relay.data}
            >
              <RelayActorProvider>
                <RouterMockProvider
                  params={router.params}
                  pathname={router.pathname}
                  slotLabel={router.slotLabel}
                >
                  <View style={{ flex: 1, minHeight: '100%', width: '100%' }}>
                    <Story />
                  </View>
                </RouterMockProvider>
              </RelayActorProvider>
            </RelayStoryProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      );
    },
  ],
  initialGlobals: { backgrounds: { value: 'kosmoLight' } },
  parameters: {
    a11y: { test: 'error' },
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
