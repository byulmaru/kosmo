## Why

Follow pair Workflow가 신규 Follow와 Follow Request ID를 Temporal `uuid4()`로 미리 배정해, 신규 주요 도메인 행 ID를 PostgreSQL 18.4 내장 `uuidv7()` column default로 생성한다는 데이터 모델 계약을 우회한다. ID 생성 책임을 데이터베이스로 되돌리되, transaction Activity commit 뒤 completion 응답이 유실되면 이미 commit된 관계 상태만 보존하고 해당 transition의 후속 create effect는 누락될 수 있다는 보장 경계를 명시한다.

## What Changes

- 신규 ProfileFollow와 ProfileFollowRequest insert에서 애플리케이션이 ID를 지정하지 않고 PostgreSQL `DEFAULT uuidv7()`을 사용한다.
- 정상 transaction Activity 완료 시 데이터베이스가 반환한 실제 row ID를 Update 결과와 Notification/Fedify create effect source로 사용한다.
- Activity commit 뒤 completion 응답이 유실된 retry에서는 기존 row를 이번 transition의 commit으로 단정해 create effect를 재구성하지 않는다. 관계 상태와 중복 방지는 유지하지만 해당 후속 effect 누락은 수용한다.
- approve/remote Accept retry에서 history의 pending Request ID가 command expected ID와 일치하고 현재 exact-pair Request는 없으며 Follow가 존재하면 effect를 다시 만들지 않고 pair lifecycle을 `ESTABLISHED`로 종료한다.
- candidate ID와 그 전달·판정 로직을 제거하고, 기존 pair uniqueness, exact-row/ABA 방어, pending request bootstrap과 Unfollow 복구 계약은 유지한다.
- PROD-328 unavailable Notification cleanup과 PR #665/#666, outbox·receipt·sweeper, DB migration과 production rollout은 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/architecture/core-services.md`
- Linear Contract: PROD-892
- Linear Implementations: PROD-892

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `temporal-follow-effects`: create row identity를 PostgreSQL default가 소유하고, transaction Activity completion-loss retry에서는 관계 상태만 수렴하며 create effect 재구성을 보장하지 않는 경계로 변경한다.

## Impact

- Worker: Follow pair Workflow의 candidate UUID 생성과 Activity 입력이 제거된다.
- Core: Follow/Request insert와 transition retry 판정이 DB 반환 ID를 사용하도록 단순화된다.
- Data: 기존 schema와 row는 변경하지 않으며 신규 ProfileFollow/ProfileFollowRequest가 이미 선언된 PostgreSQL `uuidv7()` default를 사용한다.
- Compatibility: Workflow Activity type과 호출 순서는 유지하고 입력 payload만 축소한다. 기존 history replay를 검증하며 별도 UUID 생성 Activity는 추가하지 않는다.
- Verification: 실제 DB 행의 UUID version, 반환/effect source identity, duplicate·approval retry와 기존 Workflow history replay를 검증한다.
