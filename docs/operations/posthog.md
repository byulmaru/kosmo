# PostHog 제품 분석 운영

Kosmo Web의 PostHog client는 `prod` 채널에서 공개 `posthogKey`와 `posthogHost`가 모두 주입된 경우에만 초기화한다. `dev` 채널과 설정이 없는 build에는 client와 분석 요청이 없어야 한다. 승인된 production 분석 설정은 EU PostHog host(`https://eu.i.posthog.com`)를 사용하며 Session Replay는 수집하지 않는다. SDK의 `disable_session_recording: true`와 Cloud Replay OFF를 유지한다. 이는 목표 설정 계약이며 배포 증거는 아니다.

## Identity와 개인정보 경계

- 로그인 후 identity는 내부 immutable Account ID로 `identify`한다. Profile ID를 Account identity로 사용하지 않는다.
- Account 이름·handle·email과 같은 trait, 게시글 본문·미디어·대상 Post ID·대상/선택 Profile ID는 명시적 event property로 보내지 않는다.
- 프로필 bio는 명시적 event property로 보내지 않는다. Web에서 렌더링되는 프로필 상세와 공유 프로필 목록의 bio DOM 영역은 autocapture에서 제외한다. 표시명·handle과 나머지 화면은 기존 수집 동작을 유지한다.
- Reaction은 `❤️`만 `default`, `🥹`, `🎉`, `👀`, `☘️`, `🌈`와 앞으로 승인되지 않은 값은 `custom`으로 분류한다. 원문 emoji, ID, 이름, shortcode는 보내지 않는다.
- PostHog SDK의 identity/session metadata는 SDK 경계에서 관리하며, 애플리케이션 event property allowlist와 혼동하지 않는다.

## 명시적 event allowlist

| Event              | 허용 property                            | 발생 조건                                                                                                                           |
| ------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `repost_succeeded` | `result`: `created` 또는 `removed`       | 재게시 생성 payload의 `repost.id`, 취소 payload의 요청 재게시 `postId`를 확인한 뒤. 별도 projection 오류는 기존 UI 오류 처리를 유지 |
| `reaction_added`   | `reaction_type`: `default` 또는 `custom` | `addReaction` payload가 반환된 뒤                                                                                                   |
| `reaction_removed` | `reaction_type`: `default` 또는 `custom` | `deleteReaction` payload가 반환된 뒤. `reactionId: null`인 멱등 성공도 포함                                                         |
| `bookmark_added`   | 없음                                     | 생성 payload의 `bookmark.id`를 확인한 뒤. 별도 projection 오류는 기존 UI 오류 처리를 유지                                           |
| `bookmark_removed` | 없음                                     | 응답의 `requestedBookmarkId`가 요청 ID와 일치할 때. 다른 projection의 GraphQL error가 함께 있어도 대상 삭제가 확인되면 포함         |

각 성공 mutation 결과는 해당 callback에서 한 번만 capture한다. 클릭, 메뉴 open, optimistic state, render, count 변화만으로 event를 만들지 않는다. Network error, GraphQL error로 성공 경계를 확인할 수 없는 경우, 필요한 success payload가 없는 경우, 재게시·북마크 대상 ID가 일치하지 않는 경우에는 event를 만들지 않는다. 핵심 성공 ID와 별도 projection 오류가 함께 반환되면 성공 이벤트는 기록하되 기존 UI 오류 처리는 유지한다. Analytics 초기화·identify·capture 실패는 mutation 결과와 기존 오류 처리를 변경하지 않는다.

Account가 바뀐 뒤 늦게 완료된 이전 요청은 새 Account에 귀속하지 않는다. 같은 Account에서 Profile만 바뀐 경우에는 Account identity를 유지한다. Account 전환·로그아웃 중 SDK의 reset 또는 identify가 실패하면 제품 흐름은 계속하되, SDK의 실제 `$user_id`와 distinct ID가 현재 Account와 다시 일치할 때까지 명시적 custom event를 보내지 않는다.

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
3. 재게시 생성·취소, Reaction 추가·삭제, 북마크 추가·취소를 각각 성공시켜 allowlist event와 enum만 확인한다.
4. 각 동작을 network error, 실패 응답, 필요한 payload 누락 상태에서 반복해 성공 event가 발생하지 않고 UI의 기존 오류 처리가 유지되는지 확인한다.
5. Reaction 원문과 Post·Profile 식별자가 explicit property에 포함되지 않는지 확인한다.
6. PostHog endpoint를 차단한 상태에서도 재게시·Reaction·북마크가 동일하게 완료되는지 확인한다.

Web event의 집계 Dashboard, funnel 정의, native analytics, emoji별 분석은 Worker 스냅샷과 별도 범위다. Web 수집을 재개하거나 event taxonomy를 바꿀 때는 이 문서와 canonical product contract를 함께 갱신한다.
