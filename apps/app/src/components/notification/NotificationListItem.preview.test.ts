import assert from 'node:assert/strict';
import { afterEach, before, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ReactionNotificationListItem as ReactionNotificationListItemComponent } from './NotificationListItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: unknown) => key,
  useMutation: () => [() => undefined],
});
mockModule(new URL('../../lib/date.ts', import.meta.url), {
  formatTimelineTimestamp: () => 'time',
});
mockModule(new URL('./MentionNotificationPost.tsx', import.meta.url), {
  MentionNotificationPost: 'MentionNotificationPost',
});
mockModule(new URL('./NotificationListItemView.tsx', import.meta.url), {
  NotificationListItemView: (props: Record<string, unknown>) =>
    createElement('NotificationListItemView', props),
});
mockModule(new URL('./QuoteNotificationPost.tsx', import.meta.url), {
  QuoteNotificationPost: 'QuoteNotificationPost',
});
mockModule(new URL('./ReplyNotificationPost.tsx', import.meta.url), {
  ReplyNotificationPost: 'ReplyNotificationPost',
});
mockModule(new URL('./notificationHref.ts', import.meta.url), {
  parseNotificationHref: () => null,
});

type ReactionNotificationProps = Parameters<typeof ReactionNotificationListItemComponent>[0];

let ReactionNotificationListItem: ComponentType<ReactionNotificationProps>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ ReactionNotificationListItem } = await import('./NotificationListItem'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

it('keeps Sensitive Media and preview fields when every V1 body node is unknown', async () => {
  const notification = {
    id: 'notification-1',
    createdAt: '2026-10-22T00:00:00Z',
    readAt: null,
    profile: {
      id: 'profile-1',
      displayName: 'Alice',
      handle: '@alice',
      relativeHandle: '@alice',
      avatar: null,
    },
    post: {
      id: 'post-1',
      profile: { relativeHandle: '@author' },
      content: {
        bodyText: 'future body text',
        contentWarning: 'warning',
        document: {
          version: 1,
          summary: 'warning',
          body: {
            type: 'doc',
            attrs: { sensitiveMedia: true },
            content: [{ type: 'future_block', content: [{ type: 'text', text: 'hidden' }] }],
          },
        },
        media: [{ id: 'media-1', altText: 'description', url: 'https://media.example/1.webp' }],
      },
    },
  } as unknown as ReactionNotificationProps['notification'];

  await act(async () => {
    renderer = create(createElement(ReactionNotificationListItem, { notification }));
  });

  const preview = renderer?.root.findByType('NotificationListItemView' as ElementType).props
    .preview;
  assert.deepEqual(preview, {
    bodyText: 'future body text',
    contentWarning: 'warning',
    media: [{ altText: 'description', id: 'media-1', url: 'https://media.example/1.webp' }],
    sensitiveMedia: true,
  });
});
