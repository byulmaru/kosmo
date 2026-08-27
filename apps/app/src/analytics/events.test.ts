import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeAnalyticsEvent } from './events';

describe('analytics event contract', () => {
  it('event별 outbound object를 필요한 속성만으로 새로 구성한다', () => {
    const input = {
      selected_profile_id: 'profile-id',
      visibility: 'DIRECT' as const,
      content: 'private post',
      email: 'person@example.com',
    };

    assert.deepEqual(encodeAnalyticsEvent('post_created', input), {
      name: 'post_created',
      properties: {
        selected_profile_id: 'profile-id',
        visibility: 'DIRECT',
      },
    });
  });

  it('PostHog 표준 pathname 속성으로 정규화 route를 encode한다', () => {
    assert.deepEqual(encodeAnalyticsEvent('$pageview', { $pathname: '/[profileHandle]' }), {
      name: '$pageview',
      properties: { $pathname: '/[profileHandle]' },
    });
  });

  const typecheckOnly = () => {
    // @ts-expect-error unknown event는 공용 API 계약에 포함되지 않는다.
    encodeAnalyticsEvent('unknown_event', {});
    // @ts-expect-error event별 필수 속성은 컴파일 단계에서 검사한다.
    encodeAnalyticsEvent('search_results_loaded', { tab: 'people' });
  };
  void typecheckOnly;
});
