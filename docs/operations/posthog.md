# PostHog 제품 분석 운영

Kosmo Web의 PostHog client는 prod 채널에서 공개 posthogKey와 posthogHost가 모두 주입된 경우에만 초기화한다. dev 채널과 설정이 없는 build에는 client와 분석 요청이 없어야 한다. 이 문서는 앱의 event 계약과 배포 후 확인 절차를 기록한다. 실제 수집 상태와 Session Replay 설정은 PostHog production project에서 확인한다. 이 문서를 바꾸는 것만으로 Cloud 설정이나 배포 상태를 변경하지 않는다.

## Identity와 개인정보 경계

- 로그인 후 identity는 내부 immutable Account ID로 `identify`한다. Profile ID를 Account identity로 사용하지 않는다.
- Account 이름·handle·email과 같은 identity trait, 게시글 본문·미디어·대상 Post ID는 앱이 추가하는 명시적 event property에 넣지 않는다. `selected_profile_id`는 Profile 생성·선택, 게시, 팔로우 event의 기존 허용 property이며 Reaction event에는 넣지 않는다.
- 프로필 bio는 명시적 event property로 보내지 않는다. Web에서 렌더링되는 프로필 상세와 공유 프로필 목록의 bio DOM 영역은 Session Replay에서 마스킹하고 autocapture에서 제외한다. 표시명·handle과 나머지 화면은 기존 수집 동작을 유지한다.
- reaction_type의 기존 의미를 유지한다. ❤️는 default이고, 그 밖의 허용된 Unicode Reaction은 custom으로 분류될 수 있다. 여기서 custom은 사용자 정의 이모지를 뜻하지 않는다.
- 허용 집합은 canonical reactionTypeSchema가 제공하는 전체 Emoji 16 Unicode sequence다. 허용된 값에는 emoji_kind: unicode와 reaction_emoji_key를 함께 보낸다. key는 unicode: 다음에 완전한 code point sequence를 소문자 16진수와 하이픈으로 이어 붙인다. variation selector, modifier, regional indicator, zero-width joiner를 정규화하거나 제거하지 않는다.
- key는 사용한 Reaction 종류를 드러내는 분석 정보이며 익명화가 아니다. 원문 emoji, Reaction DB ID, 사용자 정의 이모지 ID·이름·shortcode·asset은 보내지 않는다. 검증되지 않은 값에는 기존 reaction_type만 기록하고 emoji_kind와 key를 생략한다.
- PostHog SDK의 표준 metadata·자동 이벤트·Session Replay 동작은 별도 contract다. 이 변경은 해당 수집 surface, SDK 설정, masking 또는 retention을 바꾸지 않는다.
- 이번 PR은 기존 2026년 9월 9일 시행 개인정보 처리방침을 유지한다. 새 Reaction 종류 key의 공개 고지와 개정 시행일이 확정되기 전에는 이 계측 변경을 production에 배포하지 않는다.

## 명시적 event allowlist

| Event            | 허용 property                                                       | 발생 조건                                                                                           |
| ---------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| reaction_added   | reaction_type; 허용된 Unicode 값이면 emoji_kind, reaction_emoji_key | addReaction 성공 payload 뒤. 요청 시작·현재 Account와 PostHog의 $user_id 및 distinct ID가 일치할 때 |
| reaction_removed | reaction_type; 허용된 Unicode 값이면 emoji_kind, reaction_emoji_key | deleteReaction payload 뒤. reactionId가 null인 멱등 성공도 포함                                     |
| repost_succeeded | result: created 또는 removed                                        | 재게시 생성 payload의 repost.id, 취소 payload의 요청 재게시 postId를 확인한 뒤                      |
| bookmark_added   | 없음                                                                | 생성 payload의 bookmark.id를 확인한 뒤                                                              |
| bookmark_removed | 없음                                                                | 응답의 requestedBookmarkId가 요청 ID와 일치할 때                                                    |

Reaction 종류를 검증할 수 없더라도 성공 이벤트와 reaction_type은 유지한다. 종류 정보 두 property는 항상 함께 있거나 함께 없다. 사용자 정의 emoji의 종류 property는 현재 보내지 않는다.

각 성공 mutation 결과는 해당 callback에서 한 번만 capture한다. 클릭, 메뉴 open, optimistic state, render, count 변화만으로 event를 만들지 않는다. Network error, 필요한 payload가 없는 응답은 성공 event를 만들지 않는다. Account A 요청이 Account B로 전환한 뒤 완료되면 기록하지 않는다. 같은 Account 안에서 Profile만 전환한 경우에는 기존 Account identity로 기록한다. PostHog의 실제 $user_id와 distinct ID가 요청 Account와 다르거나 없으면 Reaction event를 생략한다. Analytics 초기화·identify·capture 실패는 mutation 결과와 기존 오류 처리를 변경하지 않는다.

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

## 종류별 사용 지표

[Reaction 종류별 사용 쿼리](../analytics/reaction-usage/README.md)는 같은 기간과 Asia/Seoul timezone에서 key별 사용 Account 수, 추가·제거 횟수, Account별 추가 횟수 분포를 계산한다. 사용자 정의 이모지는 현재 계측하지 않는다. 내부·테스트 Account 또는 봇의 검증된 제외 목록이 없어 해당 사용은 제외하지 않으며, 기간과 미적용 조건을 결과와 함께 기록한다.

쿼리는 식별된 Web 이벤트만 집계하며 전체 제품 사용량, 노출을 통제한 선호도, 또는 현재 남아 있는 Reaction 수를 뜻하지 않는다. key 없는 과거 이벤트와 수집 중단 기간을 특정 종류에 배분하거나 backfill하지 않는다. PostHog Cloud Insight를 만들거나 설정을 바꾸는 일은 이 변경 범위에 포함하지 않는다.

## 배포·설정 변경 후 확인

수집 설정이나 앱 배포가 변경되면 production build와 PostHog project 설정을 같은 배포 경계에서 확인한다. 실제 사용자 식별자나 콘텐츠를 ticket·스크린샷에 복사하지 않는다.

1. 설정이 없는 dev build에서 PostHog 요청이 없는지 확인한다.
2. production Web에서 로그인 후 Account ID 하나의 identify가 발생하는지 확인한다. 이름·handle·email이 identity trait에 없는지 확인하고 선택 Profile ID는 해당 event allowlist와 대조한다.
3. 재게시 생성·취소, Reaction 추가·삭제, 북마크 추가·취소에서 allowlist event와 property만 확인한다. Reaction의 Unicode 변형별 key가 달라지고 원문 Reaction과 Post·Profile 식별자가 없는지 확인한다.
4. 각 동작의 network error·실패 응답·payload 누락과 Account 전환 뒤 늦은 Reaction callback에서 성공 event가 발생하지 않고 UI 오류 처리가 유지되는지 확인한다.
5. PostHog endpoint를 차단한 상태에서도 재게시·Reaction·북마크가 동일하게 완료되는지 확인한다.
6. 위 조건을 확인한 뒤 Reaction 종류별 쿼리를 승인된 project에서 실행하고 결과 해석을 기록한다.

실제 PostHog Cloud 수집·Dashboard 설정, collection restart, production deployment와 production acceptance는 별도 책임이다.

Web event의 집계 Dashboard, funnel 정의, native analytics는 Worker 스냅샷과 별도 범위다. Web 수집을 재개하거나 event taxonomy를 바꿀 때는 이 문서와 canonical product contract를 함께 갱신한다.
