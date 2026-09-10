## Context

이 설계는 proposal의 범위와 `specs/notification/spec.md`의 다섯 요구사항을 구현하기 위한 비규범적 안내다. 제품 행동은 최신 canonical Notification·Profile Mute·Profile Block 문서와 PROD-327의 2026-09-10 승인 계약에서 파생한다.

작성 기준 main에서는 source commit과 Notification projection이 분리되어 있지만 실제 Mute·Block 생성 판정은 없다. upstream 이슈 상태와 capability의 main 반영은 시점에 따라 다를 수 있으므로, 이슈 상태만으로 runtime 반영을 가정하지 않는다. Spec Gate와 선행 구현 완료 조건은 별도로 확인한다.

## Goals / Non-Goals

**Goals:**

- 기존 다섯 source가 Recipient·Related Profile에 동일한 Mute·Block 판정을 적용한다.
- source의 성공과 정책 effect의 실패를 분리하고 기존 retry·멱등성·Read State를 보존한다.
- capability의 실제 조회 경계를 재사용하고 source마다 같은 정책을 중복 구현하지 않는다.

**Non-Goals:**

- Mute·Block capability 자체, 기간 Mute의 preset·생성·변경 action/UI, Domain Block, Quote·Mention 생성, UI·GraphQL shape 변경. 이미 저장된 기간 Mute의 Notification 활성 판정은 이 change에 포함한다.
- 기존 알림의 숨김·cleanup 재설계, source lifecycle·queue·retry 변경, 과거 source 재생.
- 강한 직렬화 보장을 위한 새 DB lock·전용 저장소·정책 snapshot 도입.

## Implementation Guidance

### Current Constraints

| 경계                    | 현재 구현과 확인할 제약                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Follow / Follow Request | `packages/core/services/notification.ts`가 source ID로 Followee·Follower를 파생한다. `apps/worker/src/workflows/profile-follow-pair.ts`의 commit 이후 FIFO effect가 이를 호출한다. source가 없어졌거나 terminal이면 기존 no-op을 따른다.                                                                                                                |
| Reply                   | `packages/core/services/create-reply-notification.ts`가 Reply와 Parent를 읽어 생성한다. `apps/worker/src/workflows/create.ts`의 Post effects에서 실행하며 Parent Author와 Reply Author를 혼동하지 않는다.                                                                                                                                               |
| Reaction / Repost       | `packages/core/services/notification.ts`가 각 source에서 actor·Recipient를 파생한다. 기존 self·Local Recipient·source/related availability와 post-commit Workflow 경계를 유지한다.                                                                                                                                                                      |
| Membership / 조회       | `packages/core/visibility/notification.ts`와 API의 visible Notification 정책은 기존 조회 경계다. 생성 억제를 여기서만 구현하면 insert를 막지 못한다.                                                                                                                                                                                                    |
| Mute / Block capability | 작성 기준 main의 `profile-mute.ts`는 mutation을 제공하며 재사용 가능한 Mute·Block 공통 read predicate는 조사 범위에서 확인되지 않았다. 최종 PROD-814·822 반영 뒤 실제 경계를 다시 읽는다. 존재하지 않는 helper 이름을 선행 계약처럼 고정하지 않는다. Notification Mute는 `expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP`를 DB 시각으로 평가한다. |
| 실패 / 중복             | projection DB 오류는 호출자·Activity로 전파된다. 기존 `settleEffects`는 sibling을 정리한 뒤 오류를 관찰하고, Notification 고유성은 Recipient·kind·source ID로 유지한다.                                                                                                                                                                                 |

### Recommended Approach

source별 service는 현재처럼 원인 객체와 Recipient·Related Profile을 파생하고 기존 생성 조건을 확인한다. 그 다음 insert 전에 공통 Notification eligibility 함수를 호출하는 접근을 권장한다. 이 함수는 실제 Mute·Block capability의 조회 경계를 조합하고, 정상 allow/deny를 반환하며 조회 오류는 기존 호출자 경계로 전달한다. 공통 predicate만 있어도 같은 결과를 보장할 수 있다면 별도 wrapper를 늘릴 필요는 없다.

Mute는 Recipient→Related 방향에서 `expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP`인 관계를 확인하고, Block은 두 방향 중 하나라도 존재하는지 확인한다. `CURRENT_TIMESTAMP`는 정책을 평가하는 DB transaction의 시각이며, 같은 시각이거나 과거인 만료 관계는 Mute deny가 아니다. 최신 Profile·콘텐츠 직접 조회 policy는 이 pair 판정을 대신하지 않는다. 현재 transaction 안에서 projection을 처리하는 source는 그 경계를 유지하고, source action transaction이나 transport context를 새로 넘기지 않는다.

deny는 insert 없이 정상 종료한다. 조회 오류는 insert에 도달하지 않고 기존 Activity 실패·retry로 전파한다. 오류를 `false`로 바꾸는 catch는 기존 장애 관찰과 retry를 바꾸므로 권장하지 않는다. 기존 logger·Workflow failure surface를 사용하며 별도 delivery system이나 지표 infrastructure를 만들지 않는다.

검증은 실제 관계와 source를 생성한 DB 통합 테스트를 중심으로 한다. Block 때문에 신규 source action 자체가 거부되는 경우에는 source commit 후 Block이 생기고 effect가 뒤늦게 실행되는 순서를 사용해 생성 정책을 검증한다. 조회 실패는 실제 정책 query 경계에서 격리된 DB 오류를 주입하거나 기존 query seam을 테스트 범위에서 대체해 확인한다. production evaluator/callback이나 테스트 전용 DB abstraction은 추가하지 않는다.

### Allowed Alternatives

- 하나의 공통 application policy 함수 또는 capability query를 조합한 공통 SQL predicate 모두 허용한다. 다섯 source의 동일 판정, 오류 전파, 실제 관계 재사용과 source commit 보존을 충족해야 한다.
- 각 projection의 기존 transaction 안에서 판정하거나 source 재조회 이후 insert 직전에 판정할 수 있다. 조회·생성의 기존 race·retry 의미를 유지하는 범위에서 선택하며, source transaction을 늘리거나 전체 pair를 직렬화하지 않는다.
- helper 이름·파일 배치·내부 반환 표현은 규범이 아니다. source별 정책 복제와 새로운 제품 행동 없이 같은 관찰 결과를 만족하면 구현자가 선택한다.

### Known Traps

- Block을 `visibleProfileWhere`나 Post 직접 조회 결과로만 대체하면, Profile identity 또는 한쪽 콘텐츠 조회가 허용될 때 알림이 잘못 생성될 수 있다.
- Mute를 양방향으로 조회하거나 Account·selected Profile로 정책을 잡으면 다른 Recipient의 알림을 억제한다.
- 정책 오류를 allow로 처리하면 fail-open이고, 정상 deny로 삼키면 기존 failure/retry 계약을 바꾼다. 만료 시각을 애플리케이션 시계로 비교하거나 `>=`로 비교하면 DB 시각과 정확히 같은 경계를 잘못 억제한다.
- post-commit effect에 caller transaction을 넘기거나 source 저장 transaction에 정책을 합치면 source rollback 위험이 생긴다.
- schema의 Block table 존재, capability 이슈의 Done, 문서의 Quote Type만으로 runtime helper·source 구현을 가정하지 않는다.
- 새 생성 policy에 기존 알림 삭제·Read 갱신·Block cleanup을 넣거나 해제 시 과거 source를 순회하지 않는다.

## Risks / Trade-offs

- [선행 코드 차이] → 구현 시작 전에 PROD-813·814 완료와 PROD-822의 최신 정책·실제 read boundary를 다시 확인한다. 작성 시점의 main 경로는 참고 근거다.
- [정책 평가와 관계 변경 경합] → 기존 social action의 동시성 모델을 유지한다. 이 change는 평가 후 관계가 바뀌는 모든 경합을 직렬화하거나 저장된 알림의 즉시 물리 삭제를 보장하지 않는다. 기존 조회·cleanup 정책과 범위를 구분한다.
- [조회 추가와 장애] → source마다 판정 한 경계를 두고 중복 조회를 피한다. 조회 오류는 기존 effect retry·관찰 경계로 전달하며 원본 commit을 유지한다.
- [source 누락] → 현재 다섯 source를 각각 실행해 동일 정책을 검증한다. 새 source가 이미 추가됐으면 이슈 범위를 먼저 정렬한다.

## Migration Plan

1. Spec Gate 승인과 선행 capability 완료·실제 반영을 확인한다. schema migration·backfill은 없다.
2. 실제 capability에 연결된 공통 정책과 다섯 source integration을 함께 검증하고 기존 API/Worker 배포 방식으로 전달한다. 새 feature flag나 rollout system을 도입하지 않는다.
3. 배포 후 기존 관찰 수단으로 Notification effect 오류와 원본 action 결과를 확인한다. 이전 Worker가 남아 있으면 새 정책 적용이 보장되지 않으므로 기존 배포 절차의 교체 상태를 확인한다.
4. rollback은 이 change의 code release를 이전 버전으로 되돌리는 범위다. 관계·source·기존 Notification을 삭제하거나 복구하는 migration은 하지 않는다. rollback 동안 신규 생성 억제 보장이 사라질 수 있으므로 원인과 영향 기간을 기록하고 수정 배포한다.

## Open Questions

새 제품 결정은 없다. 최종 선행 코드의 helper·query 위치와 runtime 반영 상태는 구현 착수 전에 확인해야 하며, 확인 전 구현을 시작하지 않는다. 현재 공개된 source 수가 바뀌거나 기존 capability로 승인된 계약을 충족할 수 없으면 Linear·canonical부터 다시 정렬한다.
