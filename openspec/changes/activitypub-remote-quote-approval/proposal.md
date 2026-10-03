## Why

원격 Quote를 기존 Post 관계와 카드에 연결하려면 인용 승인과 Source 조회 권한을 구분해야 한다. 승인되지
않았거나 철회된 Source는 숨기면서 인용 작성자의 본문을 보존하는 수신 계약을 구현한다.

## What Changes

- FEP `quote` 우선 처리, 자기 인용·QuoteAuthorization 검증, 승인서 없는 레거시 호환을 연결한다.
- 승인 메타데이터와 revision을 저장하고 전용 Workflow에서 Source 확보·승인 판정·연결을 수행한다.
- 승인 정보 Update와 승인서 Delete를 처리하며 중복 수신과 늦은 결과가 현재 상태를 되돌리지 않게 한다.
- 승인과 viewer별 조회 정책을 모두 통과한 Source만 목록·상세의 기존 카드에 표시한다.
- 호환되는 Fedify 2.4 prerelease 세트를 명시적으로 pin하고 compatibility validation 통과 후에만 채택한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`의 Remote Quote Approval, 원격 인용 정보 반영, 원격 인용 승인 철회 반영, 원격 Quote Source 표시; `docs/domain/decisions/0027-activitypub-remote-quote-approval.md`; 기존 표시 경계는 `docs/design/post-action-bar.md`.
- Linear Contract: [PROD-792](https://linear.app/byulmaru/issue/PROD-792)의 구현 계약·검증·제외 범위, Reply Source와 재사용 경계 정렬, Fedify dependency 채택 조건.
- Linear Implementations: PROD-792가 이 change의 구현·해당 검증·전체 통합 검증·정합성 확인·delta sync·archive를 소유한다.
- Approval: 2026-09-10 PROD-792 Spec 대화 `01a07e8d-8c62-7c90-ab60-482fb0edf379`에서 최신 검토안 전체의 Domain Gate 및 Issue Gate를 명시적으로 승인했다. 새 OpenSpec의 Spec Gate는 별도다.

## Capabilities

### New Capabilities

- `activitypub-remote-quote-approval`: 원격 Quote의 승인·철회·revision·Source 확보와 조회를 연결하는 계약 및 dependency 채택 검증 조건.

### Modified Capabilities

- `post`: 기존 `Post GraphQL object` requirement 전체를 MODIFIED delta로 보존하면서 원격 Quote의 승인 조건과 viewer별 Source 조회 정책을 함께 적용한다.

## Impact

`packages/fedify`의 수신·vocabulary 처리, `packages/core`의 Post 관계·DB 메타데이터,
`apps/worker`의 Workflow·Activity 등록, `apps/api`의 기존 Source resolver와 목록·상세 소비자가 영향을 받는다.
DB 변경은 additive 방식으로 준비한다. 관련 `@fedify/*`와 lockfile은 구현 단계의 호환성 검증 대상이며
이 문서 작성으로 버전을 선택하거나 채택하지 않는다.

선행 PROD-509의 materializer와 기존 content/media helper·core `createPost`를 재사용한다. PROD-661은
흡수되어 Canceled이며 별도 projector를 요구하지 않는다. PROD-509 → PROD-792 → PROD-793 순서를 유지하고
구현 착수 시 선행 구현·검증·Stack 부모를 재확인한다.

## Non-goals

로컬 Quote 작성(PROD-431), 발신 정책·구현(PROD-902/924), QuoteRequest·승인 발급, 미저장 Followers Only
fetch(PROD-793), 일반 Note 수정(PROD-365), IRI-only Note fetch·hydration과 authorization-only Update 표현,
Parent fetch·backfill(PROD-506), 알림 생성·조회·보존·정리
(PROD-926), 주기적 승인 재검증, 재귀 Quote 표시, `quote-inline` 재작성과 새 GraphQL 타입·화면은 제외한다.
