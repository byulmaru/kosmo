import type { AnalyticsEventArgs } from './events';

const typecheckOnly = () => {
  const screenContext: AnalyticsEventArgs = [
    'multi_profile_context_observed',
    {
      observation_kind: 'screen',
      available_profile_count: 2,
      selected_profile_id: 'profile-id',
    },
    { accountId: 'account-id', uuid: 'event-uuid', timestamp: new Date() },
  ];
  void screenContext;
  const availabilityContext: AnalyticsEventArgs = [
    'multi_profile_context_observed',
    { observation_kind: 'availability', available_profile_count: 1 },
  ];
  void availabilityContext;
  // @ts-expect-error unknown event는 공용 API 계약에 포함되지 않는다.
  const unknownEvent: AnalyticsEventArgs = ['unknown_event', {}];
  void unknownEvent;
  // @ts-expect-error event별 필수 속성은 컴파일 단계에서 검사한다.
  const missingProperty: AnalyticsEventArgs = ['search_results_loaded', { tab: 'people' }];
  void missingProperty;
  // @ts-expect-error bookmark event는 명시적 property를 허용하지 않는다.
  const bookmarkProperty: AnalyticsEventArgs = ['bookmark_added', { post_id: 'post-id' }];
  void bookmarkProperty;
  // @ts-expect-error pageview는 PostHog SDK가 소유하며 app event 계약에 포함되지 않는다.
  const pageview: AnalyticsEventArgs = ['$pageview', { $pathname: '/' }];
  void pageview;
};
void typecheckOnly;
