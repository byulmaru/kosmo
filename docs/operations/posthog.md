# PostHog 제품 분석 운영

Kosmo Web·Native의 PostHog client는 `prod` 채널에서 공개 `posthogKey`와 `posthogHost`가 모두 주입된 경우에만 초기화한다. `dev` 채널과 설정이 없는 build에는 client와 분석 요청이 없어야 한다. 승인된 production 분석 설정은 EU PostHog host(`https://eu.i.posthog.com`)를 사용한다. Web은 `disable_session_recording: true`와 Cloud Replay OFF로 Session Replay를 수집하지 않는다. Native는 명시적으로 호출된 앱 event와 Expo Router 경로 template 기반 `$screen`, SDK 기본 app lifecycle event를 수집하며 Session Replay는 수집하지 않는다. Screen 이름은 route group을 제외한 `useSegments` template만 사용해 `/[profileHandle]`처럼 기록한다. 실제 pathname, query, dynamic route 값과 ID는 screen 이름에 넣지 않는다. Native의 `Application Opened` event는 `before_send`에서 SDK가 추가한 `url`만 제거해 OAuth 초기 URL의 code·state를 보내지 않으며, 나머지 SDK event property는 유지한다. Native session은 SDK의 기본 event 기반 수명을 따른다. 수집 event가 30분간 없거나 session이 24시간에 도달하면 만료되고, 앱 재시작 시 session ID를 이어 쓰지 않는다. 별도 체류 시간 timer나 heartbeat는 두지 않는다. Native는 기존 session bridge에서 로그인 Account를 identify하고, 성공한 로그아웃 또는 Account 삭제 뒤 local session 정리에서 reset한다. 이는 목표 설정 계약이며 배포 증거는 아니다.

## Identity와 개인정보 경계

- 로그인 후 identity는 내부 immutable Account ID로 `identify`한다. Profile ID를 Account identity로 사용하지 않는다.
- Account 이름·handle·email과 같은 trait, 게시글 본문·미디어·대상 Post ID·대상/선택 Profile ID는 명시적 event property로 보내지 않는다.
- 프로필 bio는 명시적 event property로 보내지 않는다. Web에서 렌더링되는 프로필 상세와 공유 프로필 목록의 bio DOM 영역은 autocapture에서 제외한다. 표시명·handle과 나머지 화면은 기존 수집 동작을 유지한다.
- Reaction은 `❤️`만 `default`, `🥹`, `🎉`, `👀`, `☘️`, `🌈`와 앞으로 승인되지 않은 값은 `custom`으로 분류한다. 원문 emoji, ID, 이름, shortcode는 보내지 않는다.
- PostHog SDK의 identity/session metadata는 SDK 경계에서 관리하며, 애플리케이션 event property allowlist와 혼동하지 않는다.

## 명시적 event allowlist

| Event              | 허용 property                                                  | 발생 조건                                                                                                                           |
| ------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `repost_succeeded` | `result`: `created` 또는 `removed`                             | 재게시 생성 payload의 `repost.id`, 취소 payload의 요청 재게시 `postId`를 확인한 뒤. 별도 projection 오류는 기존 UI 오류 처리를 유지 |
| `reaction_added`   | `reaction_type`: `default` 또는 `custom`                       | `addReaction` payload가 반환된 뒤                                                                                                   |
| `reaction_removed` | `reaction_type`: `default` 또는 `custom`                       | `deleteReaction` payload가 반환된 뒤. `reactionId: null`인 멱등 성공도 포함                                                         |
| `bookmark_added`   | 없음                                                           | 생성 payload의 `bookmark.id`를 확인한 뒤. 별도 projection 오류는 기존 UI 오류 처리를 유지                                           |
| `bookmark_removed` | 없음                                                           | 응답의 `requestedBookmarkId`가 요청 ID와 일치할 때. 다른 projection의 GraphQL error가 함께 있어도 대상 삭제가 확인되면 포함         |
| `post_created`     | `selected_profile_id`, `visibility`, `ai_prohibit_image_count` | 유효한 `createPost` 응답의 Post ID 또는 PostRequest ID를 확인한 뒤 한 번                                                            |

현재 Post Composer는 유효한 `createPost.post.id` 또는 `acceptedRequest.id`가 있는 응답에서 기존
`trackAnalytics` SDK 경로로 `post_created`를 기록한다. `ai_prohibit_image_count`는 실제 제출 snapshot에서
AI 학습 방지 필터를 선택한 첨부 이미지 수이며, 해당 선택이 없으면 `0`이다. 이는 접수된 제출만 세므로 나중의
게시 처리 실패나 취소도 이미 기록한 event를 회수하지 않는다. `post`가 `null`인 pending 접수도 포함한다. 이
응답 분기는 부분 GraphQL 오류가 있어도 요청을 접수한 것으로 처리하므로 함께 반환된 오류가 event를 억제하지
않는다. Network error, 접수 ID가 없는 응답에는 event를 기록하지 않는다. 기존 Account identity와 SDK
privacy/configuration guard, best-effort 전송을 유지한다.

PostHog에서 `ai_prohibit_image_count > 0`으로 필터링하면 보호 이미지가 포함된 제출 수를 볼 수 있다. 분모에는
`ai_prohibit_image_count` 속성이 있는 `post_created` event만 포함해 Worker event를 제외한 클라이언트 접수 수를
센다. 이 property를 합산하면 제출한 보호 이미지 수를 볼 수 있다. 이 property는 숫자만 전송하며 미디어 ID나
콘텐츠를 포함하지 않는다.

별도의 선택적 Worker capture 경로와 과거 server `post_created` event는 실제 DB commit 뒤 기록된 Post를 나타낸다.
이 raw server capture에는 브라우저 URL·referrer가 없으며 client SDK의 event 시각·UUID와 다르다. 이 server event와
기존 집계 필터는 과거 데이터에 유지한다. 일반 Composer 흐름은 별도 Worker capture를 요청하지 않는다. 허용
property, Web·Native 분류와 Web 주간 집계 조건은 [멀티 Profile 사용 운영 계약](posthog-multi-profile-usage.md)을 따른다.

각 성공 mutation 결과는 해당 callback에서 한 번만 capture한다. 클릭, 메뉴 open, optimistic state, render, count 변화만으로 event를 만들지 않는다. Network error, GraphQL error로 성공 경계를 확인할 수 없는 경우, 필요한 success payload가 없는 경우, 재게시·북마크 대상 ID가 일치하지 않는 경우에는 event를 만들지 않는다. 핵심 성공 ID와 별도 projection 오류가 함께 반환되면 성공 이벤트는 기록하되 기존 UI 오류 처리는 유지한다. Analytics 초기화·identify·capture 실패는 mutation 결과와 기존 오류 처리를 변경하지 않는다.

Account가 바뀐 뒤 늦게 완료된 이전 요청은 새 Account에 귀속하지 않는다. 같은 Account에서 Profile만 바뀐 경우에는 Account identity를 유지한다. Web에서 Account 전환·로그아웃 중 SDK의 reset 또는 identify가 실패하면 제품 흐름은 계속하되, SDK의 실제 `$user_id`와 distinct ID가 현재 Account와 다시 일치할 때까지 명시적 custom event를 보내지 않는다.

## 첫 프로필 온보딩 원시 이벤트

첫 프로필 흐름은 기존 `profile_created`, `profile_selected`, `follow_succeeded`의 성공 의미와 Account identity를 재사용하고 아래 원시 이벤트를 더한다. 이 이벤트만으로 계정 가입 완료, 이탈, 전환율, 리텐션을 단정하지 않는다. 단계는 `handle`, `details`, `tags`, `posting`, `review`, `discovery`이며 `discovery`는 실제 진입했을 때만 기록한다.

| Event                                  | 허용 property                                                                                                                                                        | 기록 경계                                                                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first_profile_onboarding_started`     | `flow_id`                                                                                                                                                            | 처음 실제 핸들 단계를 연 때 한 번                                                                                                                                                                             |
| `first_profile_onboarding_step_viewed` | `flow_id`, `step`, `visit_sequence`                                                                                                                                  | 유효한 단계 화면에 진입했을 때. 재렌더는 새 진입이 아니다.                                                                                                                                                    |
| `first_profile_onboarding_action`      | `flow_id`, `step`, `action`, `action_sequence`, 선택 `tag_index`                                                                                                     | 사용자가 진행, 저장, 생략, 바로 시작, 계속, 재시도, 태그 선택, 팔로우, 언팔로우, 요청 취소를 실제로 시작했을 때                                                                                               |
| `first_profile_onboarding_operation`   | `flow_id`, `step`, `operation`, `result`, `operation_attempt`, 선택 `action_sequence`, `tag_index`, `error_type`                                                     | 실제 처리의 관측된 성공·실패 또는 화면 전환으로 관측하지 못한 결과에 한 번. `result`는 `succeeded`, `failed`, `not_observed`; 오류 분류는 `validation`, `network`, `response`, `media`, `unknown` enum만 사용 |
| `first_profile_onboarding_discovery`   | `flow_id`, `stage`, `result`, 선택 저장 태그 개수 상태·개수, `tag_index`, `result_count`                                                                             | 저장 태그와 첫 관련 프로필 목록의 `loaded`, `empty`, `failed` 결과. `result_count`는 처음 받은 목록 크기이며 페이지 추가 결과와 섞지 않는다.                                                                  |
| `first_profile_onboarding_completed`   | `flow_id`, `exit_reason`, 저장 태그 개수 상태·개수, `follow_relationship_count`, `follow_request_count`, `follow_operation_pending_count`, `operation_pending_count` | 태그가 없는 흐름이 종료되거나 사람이 찾기 화면에서 계속했을 때 한 번. 계속을 누른 순간의 처리 상태를 snapshot으로 기록한다.                                                                                   |
| `first_profile_onboarding_home_viewed` | `flow_id`                                                                                                                                                            | 완료 뒤 같은 Account로 실제 `/home` 화면에 도달했을 때 한 번                                                                                                                                                  |

`action` enum은 `next`, `save`, `skip`, `start_now`, `continue`, `retry`, `select_tag`, `follow`, `unfollow`, `cancel_request`다. `operation` enum은 `create_profile`, `select_profile`, `save_profile`, `upload_profile_image`, `load_saved_tags`, `load_related_profiles`, `load_more_related_profiles`, `follow_profile`, `unfollow_profile`, `cancel_follow_request`다. `discovery.stage`는 `saved_tags` 또는 `related_profiles`, 결과는 `loaded`, `empty`, `failed`; 완료의 `exit_reason`은 `no_saved_tags` 또는 `continued`다. 저장 태그 개수 상태는 `known` 또는 `unknown`이다.

같은 화면의 재렌더와 성공적으로 보여준 태그 목록의 Relay cache 재사용은 새 단계 방문이나 새 목록 성공으로 기록하지 않는다. 시스템 뒤로가기나 프로필 상세에서 돌아와 단계 화면이 다시 활성화되면 새 방문으로 기록한다. 목록 조회를 사용자가 다시 시도하면 별도 `retry` action과 새 operation attempt를 기록한다. 다른 태그의 목록은 각 `tag_index`에서 처음으로 화면에 나타난 결과를 기록한다. 태그 전환이나 화면 이탈로 결과 관측이 끝난 조회·재시도·페이지 조회는 `not_observed`로 종료하며, 계속하기 순간의 pending snapshot은 이탈 전 상태를 유지한다.

`profile_created`와 `profile_selected`는 기존 필수 property를 유지하고 `flow_id`, `action_sequence`, `operation_attempt` correlation property만 선택적으로 더한다. 프로필 생성은 유효한 생성 응답 뒤 한 번, 선택은 실제 actor 선택 뒤 한 번 기록한다. 실패한 선택 재시도는 성공한 생성을 다시 기록하지 않는다. `follow_succeeded` 역시 기존 property에 같은 correlation property만 선택적으로 더하며 실제 관계 또는 승인 요청 응답 뒤 기록한다. 자동 계정 설정 팔로우는 온보딩의 사용자 팔로우 수에 포함하지 않는다.

`flow_id`는 화면 흐름마다 새로 만들며 Account, Profile, 태그 또는 팔로우 대상에서 파생하지 않는다. 새 온보딩 원시 이벤트에는 Account ID, 입력한 handle·표시명·소개·태그 문자열, 태그 ID, 팔로우 대상 Profile ID, 오류 원문을 보내지 않는다. 태그는 화면 내 순서인 `tag_index`만 사용한다. 팔로우 대상은 event property로 전송하지 않고 화면 메모리의 관계 상태로만 관리해 완료 시 고유한 성립 관계·승인 요청 수를 계산한다. 언팔로우와 요청 취소는 mutation 응답이 성공을 확인할 때만 그 상태를 제거한다. 아직 끝나지 않은 follow 작업과 전체 작업은 완료 snapshot에서 별도 count로 남긴다. 저장 태그 수를 아직 응답받지 못했다면 마지막으로 확인한 값을 보존하고, 한 번도 확인하지 못한 경우 `saved_tag_count_status: unknown`으로 기록한다.

온보딩 capture는 현재 Account에 한정한 best-effort 경로를 사용한다. Web은 SDK의 `$user_id`와 distinct ID가 시작 Account와 모두 같아야 하고 Native는 distinct ID가 같아야 전송한다. 전송·초기화 실패와 identity 불일치는 UI 진행이나 mutation 오류 처리를 바꾸지 않는다. 완료 후 홈 event는 화면 bridge의 실제 `/home` 진입에서 한 번만 소비하며, 로그아웃·Account 변경으로 identity가 맞지 않으면 이전 흐름 event를 새 Account에 보내지 않는다.

## Worker 데이터베이스 집계 스냅샷

Worker는 `ENVIRONMENT=prod`인 경우에만 매 24시간 `database_counts_snapshot` event를 보낸다. 개발 환경에는 스케줄을 등록하지 않으며, Activity에서도 production 환경과 설정을 다시 확인한다. 이 system event는 고정 `distinct_id`인 `kosmo-production-db`를 사용하고 `$process_person_profile: false`를 보내므로 Account/Profile person이나 로그인 identity와 연결되지 않는다. 스냅샷 시각은 event의 top-level `timestamp`로 전송한다.

2026-10-03 Kosmo project의 native Metrics probe에서는 약 30일 뒤 만료되는 결과를 관측했다. 이는 해당 project/probe에 대한 관측이며 다른 project나 plan의 보존 기간을 뜻하지 않는다. 장기 추세의 원본은 일별 `database_counts_snapshot` event로 두고, Dashboard query는 최근 1년 범위를 요청한다. 실제 조회 가능 기간은 해당 project의 event retention에 따르며, 현재 설정을 확인하지 않았으므로 1년 또는 영구 보존을 보장하지 않는다. PostHog [Metrics 문서](https://posthog.com/docs/metrics)를 참고한다.

스냅샷은 read-only repeatable-read PostgreSQL transaction에서 Profile과 Post 전체 row를 집계한다. row security가 집계를 숨기는 경우 쿼리는 실패한다. PostgreSQL statement timeout은 30초다. PostHog event의 top-level `timestamp`는 DB snapshot 관측 시각이며, Workflow run UUID를 event UUID로 재사용해 전송 재시도가 같은 immutable snapshot을 중복 제거할 수 있게 한다. Capture 요청은 10초 뒤 중단한다. DB, 설정, timeout 또는 HTTP 실패는 zero snapshot으로 바꾸지 않고 Workflow Activity 실패로 남는다.

허용된 event properties는 다음 숫자 집계와 두 고정 값이다.

| Property                                                                    | 의미                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------ |
| `profile_count`                                                             | 전체 Profile                                     |
| `profile_local_count`, `profile_remote_count`                               | Instance kind별 Profile (`LOCAL`, `ACTIVITYPUB`) |
| `profile_active_count`, `profile_disabled_count`, `profile_suspended_count` | Profile state별 Profile                          |
| `post_count`                                                                | 전체 Post                                        |
| `post_local_count`, `post_remote_count`                                     | 작성 Profile의 Instance kind별 Post              |
| `post_active_count`, `post_deleted_count`                                   | Post state별 Post                                |
| `environment`                                                               | 항상 `prod`                                      |
| `$process_person_profile`                                                   | 항상 `false`                                     |

일별 차트는 `timestamp`를 `Asia/Seoul` 날짜로 묶고 각 날짜의 최신 값을 선택한다. Schedule 외 수동 실행이나 재전송 이벤트가 같은 날짜에 있더라도 누적 합계를 사용하지 않는다. HogQL 예시는 다음과 같다.

```sql
SELECT
  toStartOfDay(timestamp, 'Asia/Seoul') AS day,
  argMax(toFloat(properties.profile_count), timestamp) AS profile_count,
  argMax(toFloat(properties.profile_local_count), timestamp) AS profile_local_count,
  argMax(toFloat(properties.profile_remote_count), timestamp) AS profile_remote_count,
  argMax(toFloat(properties.profile_active_count), timestamp) AS profile_active_count,
  argMax(toFloat(properties.profile_disabled_count), timestamp) AS profile_disabled_count,
  argMax(toFloat(properties.profile_suspended_count), timestamp) AS profile_suspended_count,
  argMax(toFloat(properties.post_count), timestamp) AS post_count,
  argMax(toFloat(properties.post_local_count), timestamp) AS post_local_count,
  argMax(toFloat(properties.post_remote_count), timestamp) AS post_remote_count,
  argMax(toFloat(properties.post_active_count), timestamp) AS post_active_count,
  argMax(toFloat(properties.post_deleted_count), timestamp) AS post_deleted_count
FROM events
WHERE event = 'database_counts_snapshot'
  AND properties.environment = 'prod'
  AND timestamp >= now() - INTERVAL 1 YEAR
GROUP BY day
ORDER BY day
```

Saved event-backed views: [production database counts dashboard](https://us.posthog.com/project/563575/dashboard/2165835), [snapshot insight 9QlDIKUD](https://us.posthog.com/project/563575/insights/9QlDIKUD), and [snapshot insight pXxOSjkG](https://us.posthog.com/project/563575/insights/pXxOSjkG).

## 배포 후 확인

수집을 재개할 때는 production build와 PostHog project 설정을 같은 승인된 배포 경계에서 확인한다. 실제 사용자 식별자나 콘텐츠를 ticket·스크린샷에 복사하지 않는다.

1. 설정이 없는 `dev` build에서 PostHog 요청이 없는지 확인한다.
2. production Web에서 로그인 후 Account ID 하나의 `$identify`가 발생하는지 확인한다. 이름·handle·email·Profile ID가 payload에 없는지 확인한다.
3. 재게시 생성·취소, Reaction 추가·삭제, 북마크 추가·취소와 Post 요청 접수를 각각 성공시켜 allowlist event와 enum만 확인한다. Post 요청은 pending 접수와 즉시 `PUBLISHED` 응답을 포함한다.
4. 각 동작을 network error, 실패 응답, 필요한 payload 누락 상태에서 반복해 성공 event가 발생하지 않고 UI의 기존 오류 처리가 유지되는지 확인한다. Post 요청은 유효한 접수 ID가 없을 때만 event를 생략하며, 접수 뒤의 게시 실패나 취소는 event를 회수하지 않는다.
5. 각 event allowlist 밖의 Post·Profile 식별자나 Reaction 원문이 추가되지 않는지 확인한다.
6. PostHog endpoint를 차단한 상태에서도 재게시·Reaction·북마크·Post 요청 접수가 동일하게 완료되는지 확인한다.
7. Native 개발 build에서 초기 화면을 열고 route를 이동해도 PostHog client가 초기화되지 않고 요청이 없는지 확인한다.
8. Native production build에서 초기 route와 실제 이동마다 `$screen`이 발생하고, `$screen_name`은 route group을 제외한 template segment만 포함하는지 확인한다. `[profileHandle]` placeholder는 유지하고 실제 pathname, query, handle, 기타 dynamic value나 ID는 보내지 않는다. 기본 `Application Installed`, `Application Updated`, `Application Opened`, `Application Became Active`, `Application Backgrounded` event를 확인하고, `Application Opened`에는 초기 deep link `url`이 없으며 다른 SDK property는 유지되는지 확인한다. Session Replay event가 발생하지 않는지도 확인한다.
9. Native에서 PostHog 초기화·전송 실패를 유발해도 route 이동과 화면 사용이 동일하게 완료되는지 확인한다.

Web event의 집계 Dashboard·funnel 정의, Native event의 추가 집계·funnel 분석, emoji별 분석은 Worker 스냅샷과 별도 범위다. Native client의 명시적 event 수집과 Account identity/reset은 위 계약을 따른다. Web·Native 수집을 재개하거나 event taxonomy를 바꿀 때는 이 문서와 canonical product contract를 함께 갱신한다.
