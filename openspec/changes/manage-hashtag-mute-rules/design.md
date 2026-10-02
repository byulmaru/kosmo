## Current Constraints

이 문서는 PROD-1029 구현을 위한 working note다. 파일명과 API shape는 구현 중 조정할 수 있으며,
제품 계약은 `proposal.md`에 연결한 canonical·Linear를 따른다.

조사 기준은 `c2c967d672751cecc416631858288dedad3cf341`이다.

| 확인한 경계       | 현재 코드와 영향                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 공유 identity     | `packages/core/db/tables.ts`의 `Hashtags`, `ProfileHashtags`와 `apps/api/src/graphql/resolvers/hashtag/ref.ts`의 Hashtag Node가 있다. 기존 ID를 입력으로 사용한다.                                                       |
| Profile Tag 저장  | `packages/core/services/profile-update.ts`가 정규화된 이름을 공유 Hashtag로 해석한다. 뮤트에서 이름 정규화나 identity 생성을 복제하지 않는다.                                                                            |
| 기존 Profile Mute | `packages/core/services/profile-mute.ts`와 `apps/api/src/graphql/resolvers/profile/loader/mute.ts`는 Profile 대상·영구 뮤트 경로다. 그대로 복사하면 Scope·Decision·미래 만료를 처리하지 못한다.                          |
| 요청 Profile      | `apps/api/src/context.ts`가 Active Account, membership, selected Profile의 조회 가능 상태를 검증하고 `apps/api/src/graphql/builder.ts`가 Member 이상의 role을 검사한다. Local 생성 조건은 해당 action에서 추가 확인한다. |
| 구현 부재         | `packages`, `apps/api`에서 `HashtagMute`, `hashtagMute`, `hashtag_mute`, `MuteScope`, `MuteDecision`을 검색했으나 저장·API 구현을 찾지 못했다.                                                                           |
| 실행 경계         | `docs/architecture/core-services.md`, `memory/temporal/orchestration.md`, `memory/temporal/activities.md`의 Temporal-first 경계를 새 mutation의 접근 방식으로 사용한다.                                                  |

## Practical Approach

### 저장과 만료

- 독립 `hashtag_mute_rule`에 DB 기본 UUIDv7 ID, Owner Profile FK, Target Hashtag FK, Scope 집합,
  Decision, nullable 만료 시각, 생성·변경 시각을 저장하는 방안을 권장한다. 기존 Hashtag와 Post 관계는 건드리지 않는다.
- Scope와 Decision은 명시적으로 입력받는다. 만료의 `null`은 영구이며 update에서 생략한 값은 유지한다.
  non-null 값의 명시적 `null`, 빈 Scope와 과거·현재 만료 입력을 거절한다. 부분 변경도 기존 값과 입력을
  합친 최종 상태를 검증한다. 만료된 규칙에서 만료를 생략한 채 Scope나 Decision만 바꾸는 요청은 거절하고
  저장 상태를 유지한다. 미래 만료나 영구를 명시한 변경은 최종 상태가 유효할 때 확정한다.
- Owner·Hashtag의 unique constraint와 조건부 write로 경쟁하는 생성이 적용 중 규칙 둘을 만들지 못하게 한다.
  모든 row에 pair unique를 두고 만료 row를 재사용하는 방식은 가능한 최소 구현이다. 이를 만료 이력 보존 정책이나
  공개 ID 재사용 보장으로 승격하지 않는다. 적용 중 규칙을 새 create가 덮어쓰지 않게 한다.
- 만료 기준 유효성과 요청 Scope별 적용 여부를 구분한다. 서버 조회 시각에서 `expiresAt === null` 또는
  `expiresAt > now`이면 만료 기준으로 유효하다. 요청 Scope별 적용 여부는 이 조건을 만족하고 해당 Scope가
  저장된 경우에만 참이다. 따라서 유효한 Home 전용 규칙도 Search에는 적용되지 않으며, 만료된 규칙은
  저장된 Scope에도 적용되지 않는다. 시간 경과만으로 결과가 바뀌므로 cron이나 저장된 active boolean에 의존하지 않는다.
- 원자적 write 직전에 만료 조건을 평가하고, retry에서는 이미 확정한 명령 결과와 새로운 요청을 구분한다.
  영구 설정·만료 설정의 전환과 만료 후 재생성도 같은 경계에서 처리한다.

### GraphQL과 selected Profile

다음 이름과 shape는 제안이다. 실제 schema와 normalized cache 사용에 맞게 바꿀 수 있다.

| 진입점                                    | 입력과 결과                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createHashtagMuteRule`                   | Hashtag global ID, Scope 목록, Decision, 만료를 받고 서버가 확정한 Rule Node를 반환한다. Owner ID는 입력받지 않고 selected Profile에서 정한다.                                       |
| `updateHashtagMuteRule`                   | Rule global ID와 변경할 값을 받아 같은 Owner의 Rule만 갱신한다. Target Hashtag나 Owner를 다른 대상으로 옮기지 않는다.                                                                |
| `deleteHashtagMuteRule`                   | Rule global ID를 받아 해당 Owner의 규칙을 해제하고 삭제한 Rule의 정확한 global ID를 반환한다.                                                                                        |
| Hashtag의 viewer 전용 관계 필드           | Profile Tag에 이미 있는 Hashtag Node에서 selected Profile의 Rule, 만료 기준 유효성, 요청에 명시한 Scope별 적용 여부를 조회하게 한다. 비로그인·다른 Profile의 상태를 노출하지 않는다. |
| selected Profile의 규칙 목록 및 Rule Node | Owner만 Scope·Decision·만료·Hashtag와 만료 기준 유효성, 요청에 명시한 Scope별 적용 여부를 조회하게 한다. 저장된 규칙과 적용 여부를 구분한다.                                         |

Rule은 `createObjectRef`로 구현하고 다른 Node를 참조하는 필드와 viewer 필드는 기능 모듈의 `field/`에 둔다.
ID input은 concrete Node에 제한하고 삭제 결과도 Rule typename으로 encode한다. 공개 Hashtag Node에
Owner 비공개 속성을 무조건 노출하지 않는다. 단건·목록·Node loader·mutation 모두 selected Profile을 기준으로 제한한다.
만료 기준 유효성에는 Scope 입력이 필요하지 않다. Scope별 적용 여부를 조회할 때는 대상 Scope를 명시하며,
Scope 생략을 특정 Scope의 기본값이나 모든 Scope에 대한 적용으로 해석하지 않는다. 두 결과를 구분하는
구체 필드명과 인자 배치는 구현 중 정한다.

생성에는 Member 이상의 role과 canonical의 Active/Normal Local 조건을 적용한다. Owner는 Rule을 소유한
Profile을 뜻하므로 Account의 Owner role만 허용하는 제한을 추가하지 않는다. 에러는 기존
`ValidationError`, `ConflictError`, `NotFoundError`, `PermissionDeniedError`와 GraphQL `errors[]` 경계를 따른다.

### mutation 실행

GraphQL은 caller 인증과 입력을 해석한 뒤 exported `WorkflowDefinition`과 serializable input을
`runWorkflow`에 전달한다. Worker Activity가 transaction, 권한에 따른 대상 제한, validation, persistence,
retry 판정을 맡는다. query와 loader는 기존 DB 조회 경계를 사용한다.

생성·변경·제거는 각각 짧은 실행으로 구성하고, 필요한 완료 결과를 기다린 뒤 성공 payload를 반환한다.
단순 admission을 mutation 성공으로 반환하지 않는다. 이 규칙을 위해 Follow의 영구 pair lifecycle이나 effect
queue를 복제하지 않는다. 이번 범위에는 Notification·ActivityPub effect가 없다.

구현 시에는 명령을 구분하는 Workflow ID와 conflict/reuse 정책을 함께 정한다. pair ID만으로 서로 다른
변경 요청을 하나의 실행으로 합치지 않는다. Activity commit 뒤 응답 유실·재시도로 중복 생성, 이전 값의
재적용 또는 해제한 규칙의 부활이 생기지 않는지 실행 검증한다. 이 보장을 위해 명령 결과를 보존해야 한다면 해당
capability에 필요한 최소 범위로 두며 범용 command framework는 추가하지 않는다.

### 변경 후보와 검증 연결

- 저장: `packages/core/enums.ts`, `packages/core/db/enums.ts`, `packages/core/db/tables.ts`, additive migration.
- 실행: `packages/core/temporal/`의 definition, `apps/worker/src/`의 Activity와 Workflow 및 production registry.
- API: `apps/api/src/graphql/resolvers/hashtag/`, 필요한 Profile 관계 필드, `apps/api/src/graphql/enums.ts`,
  `apps/api/schema.graphql`.
- 검증: API의 실제 인증 context를 거치는 integration test, Worker의 실제 DB transaction test와 Workflow test.
  Worker DB suite는 파일을 명시하므로 새 테스트가 `apps/worker/package.json`의 실행 대상에 포함되는지 확인한다.

## Alternatives and Traps

- Profile Tag 이름을 새 뮤트 문자열 identity로 저장하면 같은 Hashtag에 대한 규칙이 갈라진다.
- 기존 Profile Mute의 `expiresAt IS NULL` 조회만 복사하면 미래 만료 규칙이 누락된다.
- 생성에서 무조건 upsert하면 적용 중인 규칙의 Scope·Decision을 다른 생성 요청이 바꿀 수 있다.
- Owner 권한은 list에만 적용해서는 부족하다. global Node ID로도 다른 Profile 규칙에 접근하지 못해야 한다.
- Local의 소비 결과를 저장 Decision에 반영하면 다른 Scope의 Collapse 의미까지 바뀐다.
- 서버가 반환하는 만료 기준 유효성과 Scope별 적용 여부는 규칙의 현재 상태를 뜻한다.
  PROD-1030·PROD-1031·PROD-1048의 목록·알림 통합 완료를 뜻하지 않는다.

## Risks / Limits

독립 table·enum·index를 더하는 additive migration을 예상한다. 기존 row rewrite나 backfill은 필요하지 않다.
구버전 read/write와 공존을 확인하고, rollback은 이전 애플리케이션으로 되돌리되 새 규칙 데이터를 보존하는
방향으로 계획한다. 실제 SQL·lock 영향·배포 검증은 구현 세션의 책임이며 여기서는 실행하지 않았다.

DB와 Temporal retry를 검증하지 않은 상태다. 이번 문서 도구는 설치된 의존성을 사용했으며, 현재
`node_modules`와 lockfile은 불일치한다. 구현 검증 전에 승인된 workspace 의존성을 동기화한다.

## Open Questions

PROD-1029의 현재 제품 범위에 새로 결정할 항목은 확인되지 않았다. UI 입력 방식·기본값은 PROD-735에
남아 있으며 이 서버 명세를 이유로 확정하지 않는다. 구현 중 이력 보존·공개 계약·권한·운영 정책의 새로운
선택이 필요해지면 canonical·Linear 또는 사용자의 결정을 먼저 확인한다.
