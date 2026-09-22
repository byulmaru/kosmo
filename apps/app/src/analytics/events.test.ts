import type { AnalyticsEventArgs } from './events';

const typecheckOnly = () => {
  const screenContext: AnalyticsEventArgs = [
    'multi_profile_context_observed',
    {
      observation_kind: 'screen',
      multi_profile_eligible: true,
      selected_profile_id: 'profile-id',
    },
    { accountId: 'account-id', uuid: 'event-uuid', timestamp: new Date() },
  ];
  void screenContext;
  const eligibilityContext: AnalyticsEventArgs = [
    'multi_profile_context_observed',
    { observation_kind: 'eligibility', multi_profile_eligible: false },
  ];
  void eligibilityContext;
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
