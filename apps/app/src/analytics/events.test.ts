import type { AnalyticsEventArgs } from './events';

const typecheckOnly = () => {
  // @ts-expect-error unknown event는 공용 API 계약에 포함되지 않는다.
  const unknownEvent: AnalyticsEventArgs = ['unknown_event', {}];
  void unknownEvent;
  // @ts-expect-error event별 필수 속성은 컴파일 단계에서 검사한다.
  const missingProperty: AnalyticsEventArgs = ['search_results_loaded', { tab: 'people' }];
  void missingProperty;
  // @ts-expect-error post_created requires the post type discriminator.
  const missingPostType: AnalyticsEventArgs = [
    'post_created',
    { selected_profile_id: 'profile-id', visibility: 'PUBLIC' },
  ];
  void missingPostType;
  // @ts-expect-error bookmark event는 명시적 property를 허용하지 않는다.
  const bookmarkProperty: AnalyticsEventArgs = ['bookmark_added', { post_id: 'post-id' }];
  void bookmarkProperty;
  const profileTargetProperty: AnalyticsEventArgs = [
    'profile_blocked',
    // @ts-expect-error new profile events do not include target profile identifiers.
    { profile_id: 'profile-id' },
  ];
  void profileTargetProperty;
  const notificationTargetProperty: AnalyticsEventArgs = [
    'notification_opened',
    // @ts-expect-error notification events do not include notification identifiers.
    { kind: 'follow', notification_id: 'notification-id' },
  ];
  void notificationTargetProperty;
  const copiedUrlProperty: AnalyticsEventArgs = [
    'link_copied',
    // @ts-expect-error link events do not include the copied URL.
    { target: 'post', url: 'https://example.com/post' },
  ];
  void copiedUrlProperty;
  // @ts-expect-error pageview는 PostHog SDK가 소유하며 app event 계약에 포함되지 않는다.
  const pageview: AnalyticsEventArgs = ['$pageview', { $pathname: '/' }];
  void pageview;
};
void typecheckOnly;
