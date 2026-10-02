## Current Constraints

이 문서는 후속 구현을 돕는 working note다. 파일·함수·쿼리 형태는 구현 과정에서 바꿀 수 있다.
정책은 canonical 문서와 PROD-1048이 소유한다.

조사 기준은 `main`의 `a890cc8766c1350ef5f5cc10c6b236c966bafb09`다.

| 경계                  | 확인한 현재 구현                                                                                         | 후속 구현에서 확인할 결과                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Profile Tag 저장·변경 | `packages/core/db/tables.ts`의 `ProfileHashtags`, `packages/core/services/profile-update.ts`의 관계 교체 | 저장된 `hashtagId`를 비교하며 bio·본문을 파싱하지 않음                  |
| Follow·Follow Request | `packages/core/services/notification.ts` → `materializeNotification`                                     | Follower를 Related Profile, Followee를 Recipient로 판정                 |
| Reaction·Repost       | 같은 서비스 → `materializeNotification`                                                                  | Reaction Owner·Repost Author를 판정하고 원문 Author는 Recipient로 사용  |
| Reply                 | `create-reply-notification.ts` → `materializeReplyNotificationIfEligible`                                | Reply Author의 태그 판정. Quote를 겸하면 조정 경로도 적용               |
| Quote                 | `quote-notification.ts` → `materializeCoordinatedNotification`                                           | Quote Author 판정과 최초 판단 기록의 원자성 유지                        |
| 공통 억제             | `notification-policy.ts`의 `isNotificationSuppressed`                                                    | 기존 양방향 Block·Recipient Profile Mute와 Profile Tag 사유를 함께 소비 |
| 저장 후 조회          | `packages/core/visibility/notification.ts`                                                               | 새 뮤트 규칙 때문에 기존 알림 조회·읽음을 다시 판정하지 않음            |

`packages/core/enums.ts`의 `NotificationKind`와 실제 서비스·Worker 경로에는 위 6종만 있다.
Mention·Followee Post는 canonical 적용 대상이지만 이 기준 commit에 생성 기반이 없다.
Quote 서비스는 현재 Local-to-Local 경로만 소비하고 `QUOTE_NOTIFICATION` rollout이 필요하다.
Remote 참여 관계만으로 최초 판단을 소비하지 않는 기존 경계를 유지한다. 본 스펙이 Remote Quote 기반이나
운영 rollout을 완성했다는 뜻은 아니다.

PROD-1029의 규칙 저장·권한·만료 소비 계약은 기준 commit에 아직 없다. 구현 시작 시 실제 결과를 인수한다.
현재 스펙 PR은 `main → PROD-1048`의 독립된 1-layer Stack이며, PROD-1029 구현 완료를 주장하지 않는다.

## Practical Approach

1. PROD-1029의 실제 저장 모델과 적용 중인 Rule 판정을 확인한다. Owner, canonical Target Hashtag,
   Notification Scope, 해제·만료 의미를 재사용하고 별도 Rule 관리 경로를 만들지 않는다.
2. 기존 공통 억제 함수 안에서 Recipient의 Rule과 Related Profile의 `ProfileHashtags`를 identity로 비교하는
   존재 여부 조회를 추가하는 접근을 우선 검토한다. Decision 값이 Exclude·Collapse 중 무엇인지로 분기하지 않는다.
   태그가 없거나 교집합이 없으면 기존 생성 정책을 계속 적용한다.
3. 생성 요청이나 Worker payload에 과거 태그 목록을 넣지 않고, 실제 생성 판단 때 DB에 저장된 관계를 읽는다.
   최초 판단이 끝난 Quote는 그 결과를 유지한다. 함수명이나 쿼리 분리는 비구속적인 구현 선택이다.
4. `materializeNotification`과 Quote·Reply 조정 경로가 모두 같은 억제 결과를 소비하는지 실제 호출로 확인한다.
   Quote는 억제된 최초 판단도 보존한다. 조회 실패는 기존 재시도 경계로 전파하며, Quote transaction 실패가
   성공한 억제 판단으로 남거나 원인 행동 자체를 되돌리지 않도록 검증한다.
5. Notification 저장 후 조회·읽음·정리 경로에는 새 predicate를 넣지 않는다. 태그·Rule 편집이 기존 알림의
   존재·Read State를 바꾸지 않는지 서비스와 필요한 API 조회로 확인한다.

## Alternatives and Traps

- 생성 서비스마다 태그 판정을 복사하면 일반 Reply와 Quote를 겸한 Reply의 경로가 갈릴 수 있다.
  현재 공유 정책을 활용하고 구체 함수 구조는 구현 중 판단한다.
- Post Hashtag가 없다는 이유로 Profile Tag 검사를 건너뛰거나, Quote Source Author를 검사하면 요구사항과 다르다.
- DB 오류를 “태그 불일치”로 바꾸면 억제 대상 알림이 생성될 수 있다. “억제 성공”으로 바꾸면 재시도가 사라질 수 있다.
- 기존 Query visibility에 새 뮤트를 넣으면 이미 저장된 알림까지 숨겨져 생성 시점 정책을 위반한다.
- 현재 Mention·Followee Post 경로가 없다는 이유로 placeholder Type이나 새 생성 기능을 추가하지 않는다.
  인계 후 구현 기준에서 해당 경로가 추가됐다면 같은 정책을 실제 생성 경로에 연결한다.

## Risks / Limits

- PROD-1029 인수 전에는 실제 Rule 필드·helper 이름과 만료 equality 경계를 확정하지 않는다.
  만료 판정은 선행 결과를 그대로 소비하고 같은 DB 시각 기준의 경계를 검증한다.
- 스펙 세션은 실제 DB·서비스 테스트를 실행하지 않는다. 후속 구현은
  `pnpm --filter @kosmo/core test:services`의 기존 격리 DB runner를 사용하고, 변경된 API·Worker 경로가 있으면
  그 경로의 focused test도 포함한다. CI의 `Test (Core)` 결과는 해당 구현 HEAD에서 별도로 확인한다.
- 이번 스펙은 새 migration·backfill·data cleanup·운영 rollout을 요구하지 않는다. 선행 Rule 모델의 migration은
  PROD-1029 책임이다. 구현을 되돌려도 억제됐던 알림이나 기존 Quote 판단을 복원·삭제하는 작업은 포함하지 않는다.
- concurrent Rule·Tag 편집의 새 직렬화 보장은 추가하지 않는다. 기존 transaction의 판정 시점과 재시도 의미를 보존한다.

## Open Questions

- 제품 정책의 미결정 사항은 없음. PROD-1029 구현 인수와 향후 생성 경로 추가 여부는 실행 시점 확인 사항이다.
