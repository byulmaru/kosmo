import './fonts.css';
import './preview.css';

import { Suspense } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { sb } from 'storybook/test';
import { PostContentWarningRevealProvider } from '@/components/post/PostContentWarningRevealContext';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { RouterMockProvider } from './mocks/expo-router';
import { RelayStoryProvider } from './mocks/react-relay';
import type { Preview } from '@storybook/react-vite';
import type { PropsWithChildren } from 'react';

sb.mock(import('../src/analytics/client.web.ts'), { spy: true });
sb.mock(import('../src/auth/webLogin.ts'), { spy: true });
sb.mock(import('../src/buildVersion.ts'), { spy: true });

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const router = context.parameters.router ?? {};
      const relay = context.parameters.relay ?? {};

      const theme = context.globals.theme === 'dark' ? 'dark' : 'light';
      const reduceMotion = context.globals.reduceMotion === true;

      return (
        <SafeAreaProvider>
          <ThemeProvider mode={theme} reduceMotion={reduceMotion}>
            <ToastProvider>
              <PostContentWarningRevealProvider key={context.id}>
                <RelayStoryProvider
                  actorBoundary={relay.actorBoundary}
                  mutationError={relay.mutationError}
                  mutationGraphQLErrors={relay.mutationGraphQLErrors}
                  mutationLoading={relay.mutationLoading}
                  mutationRequestObserver={relay.mutationRequestObserver}
                  mutationResponse={relay.mutationResponse}
                  paginationError={relay.paginationError}
                  paginationLoading={relay.paginationLoading}
                  paginationRequestObserver={relay.paginationRequestObserver}
                  paginationResponse={relay.paginationResponse}
                  paginationResponses={relay.paginationResponses}
                  operationResponses={relay.operationResponses}
                  queryData={relay.data}
                >
                  <RouterMockProvider
                    params={router.params}
                    pathname={router.pathname}
                    segments={router.segments}
                    slotLabel={router.slotLabel}
                  >
                    <Suspense
                      fallback={
                        <View style={{ padding: 24 }}>
                          <Text>스토리를 불러오는 중입니다.</Text>
                        </View>
                      }
                    >
                      <ThemedStory>
                        <Story />
                      </ThemedStory>
                    </Suspense>
                  </RouterMockProvider>
                </RelayStoryProvider>
              </PostContentWarningRevealProvider>
            </ToastProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      );
    },
  ],
  globalTypes: {
    reduceMotion: {
      description: 'OS reduced-motion 상태를 시뮬레이션합니다.',
      name: 'Reduced motion',
      toolbar: {
        icon: 'accessibility',
        items: [
          { title: 'Motion', value: false },
          { title: 'Reduced motion', value: true },
        ],
      },
    },
    theme: {
      description: '공용 primitive의 runtime theme를 선택합니다.',
      name: 'Theme',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { title: 'Light', value: 'light' },
          { title: 'Dark', value: 'dark' },
        ],
      },
    },
  },
  initialGlobals: { backgrounds: { value: 'kosmoLight' }, reduceMotion: false, theme: 'light' },
  parameters: {
    a11y: {
      // Preserve the existing Svelte/Figma #777 secondary-text token in this migration.
      // Its contrast debt is separate from the semantic accessibility parity checked here.
      config: { rules: [{ enabled: false, id: 'color-contrast' }] },
      test: 'error',
    },
    backgrounds: {
      options: {
        kosmoDark: { name: 'KOSMO Dark', value: '#000000' },
        kosmoLight: { name: 'KOSMO Light', value: '#FFFFFF' },
        kosmoSurface: { name: 'KOSMO Surface', value: '#FAFAFB' },
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
        kosmoPickerWide: {
          name: 'KOSMO picker wide',
          styles: { height: '900px', width: '600px' },
          type: 'tablet',
        },
        kosmoProfileCompact: {
          name: 'KOSMO Profile compact',
          styles: { height: '768px', width: '1024px' },
          type: 'tablet',
        },
        kosmoProfileFull: {
          name: 'KOSMO Profile full',
          styles: { height: '900px', width: '1440px' },
          type: 'desktop',
        },
        kosmoProfileIntermediate: {
          name: 'KOSMO Profile intermediate',
          styles: { height: '800px', width: '480px' },
          type: 'mobile',
        },
      },
    },
  },
};

function ThemedStory({ children }: PropsWithChildren) {
  const theme = useTheme();
  return (
    <View
      style={{ backgroundColor: theme.backgroundCanvas, flex: 1, minHeight: '100%', width: '100%' }}
    >
      {children}
    </View>
  );
}

export default preview;
