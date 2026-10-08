import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as MuteModule from './ProfileMuteAction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('react-native', {
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T>(styles: T) => styles },
});
mockModule('lucide-react-native', { Volume2: 'Volume2', VolumeOff: 'VolumeOff' });
mockModule(createRequire(import.meta.url).resolve('lucide-react-native'), {
  Volume2: 'Volume2',
  VolumeOff: 'VolumeOff',
});
mockModule('react-relay', { graphql: () => ({}), useFragment: () => ({}) });
mockModule('@/components/profile/ProfileMuteController', { useProfileMuteMutations: () => ({}) });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/ConfirmationContent', { ConfirmationContent: 'ConfirmationContent' });
mockModule('@/components/ui/ModalSheet', { ModalSheet: 'ModalSheet' });
mockModule('@/components/ui/ToastProvider', { useToast: () => ({ showToast: () => {} }) });
mockModule('@/session/SessionProvider', { useSession: () => ({ selectedProfileId: 'viewer' }) });
mockModule('@/theme/ThemeProvider', { useTheme: () => ({}) });
let muteModule: typeof MuteModule;
before(async () => {
  muteModule = await import('./ProfileMuteAction');
});

test('뮤트 확인은 취소 후 요청을 거부하고 다시 열면 실행한다', async () => {
  const requests: boolean[] = [];
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(muteModule.ProfileMuteActionControl, {
        displayName: '코스모',
        profileId: 'profile-kosmo',
        muted: true,
        surface: 'button',
        onChangeMuted: async (muted) => {
          requests.push(muted);
        },
      }),
    );
  });
  const button = renderer!.root.findByType('Button' as never);
  await act(async () => button.props.onPress());
  const confirmation = renderer!.root.findByType('ConfirmationContent' as never);
  await act(async () => confirmation.props.onCancel());
  assert.equal(renderer!.root.findByType('ModalSheet' as never).props.visible, false);
  await act(async () => confirmation.props.onConfirm());
  assert.deepEqual(requests, []);
  await act(async () => button.props.onPress());
  await act(async () => confirmation.props.onConfirm());
  assert.deepEqual(requests, [false]);
  await act(async () => renderer!.root.findByType('ModalSheet' as never).props.onDismiss());
  await act(async () => renderer.unmount());
});
