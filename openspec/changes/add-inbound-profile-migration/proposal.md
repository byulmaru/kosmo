## Why

현재 Kosmo는 원격 Profile이 Mastodon의 `Move`로 Local Profile을 대체했을 때 source identity를 검증하고, Kosmo가 관리하는 Local follower를 새 target으로 옮길 수 있는 행동 계약이 없다. Profile 단위의 준비 관계와 inbound 처리 결과를 하나의 계약으로 정해 사용자가 안전하게 이전을 준비하고, 검증된 수신만 기존 Follow lifecycle에 반영할 수 있게 한다.

## What Changes

- 사용자가 Settings의 Profile detail에서 source qualified handle을 입력해 Remote Profile을 materialize하고, 자신이 소유한 Active·Normal·Local·Open target과 Profile Migration 준비 관계를 만들 수 있게 한다.
- 준비 관계는 Local target 하나당 source 하나, Remote source 하나당 Local target 하나만 허용한다. 같은 pair 재지정은 no-op이고 다른 pair와 충돌하는 요청은 거부한다.
- Local Actor의 `alsoKnownAs` aliases를 준비 관계의 Remote source canonical Actor URI에서만 파생한다.
- 인증된 inbound ActivityPub `Move`의 actor와 object가 같은 canonical source URI인지, target canonical Actor와 target의 exact source alias가 일치하는지 검증한다. remote-to-local과 remote-to-remote target을 모두 지원하고 기존 Actor 종류를 유지한다.
- source가 아직 저장되지 않은 유효한 Move에서는 검증된 source Remote Profile을 materialize한다. remote-to-remote target은 Local 준비 관계를 요구하지 않으며, target Profile의 기존 Follow Approval Policy를 사용한다.
- source를 Followee로 가진 기존 established Follow 중 Follower가 Local Profile인 관계만 target Follow 또는 Follow Request로 먼저 저장한 뒤 source 관계를 제거한다. target 저장 실패 시 source 관계를 제거하지 않는다.
- 반복 수신과 중단 후 재개는 기존 Follow·Follow Request lifecycle의 멱등성 및 Temporal 재시도를 사용한다. 서버 간 receipt 순서와 동시 Follow/Unfollow에 대한 추가 보장은 만들지 않는다.
- **제외:** 운영자 CLI와 flag 관리 UI/CLI, outgoing Kosmo `Move`, 게시물·미디어·팔로잉을 포함한 전체 계정 이전, Follow 가져오기/내보내기, 실제 운영 계정의 이전 실행.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `docs/design/settings.md`
- Linear Contract: `PROD-743`
- Linear Implementations: `PROD-743` (새 이슈 없이 3-layer 전체 계약·완료 책임을 유지한다.)

### Stack responsibility mapping (2026-09-08)

[tasks.md](./tasks.md)의 Stack responsibility mapping에 따라 기존 PR #787 (bottom) → `PROD-743-move` (middle) → `PROD-743-settings` (top)으로 책임을 나눈다. 세 layer는 모두 `PROD-743`에 속하며, 개별 layer Ready/merge만으로 change를 archive하지 않는다.

## Capabilities

### New Capabilities

- `inbound-profile-migration`: Profile Migration 준비 관계, Local Actor alias, 검증된 inbound ActivityPub Move와 Local follower의 target Follow 이전

### Modified Capabilities

- `settings-page-shell`: Profile detail의 Profile Migration 준비 control을 feature flag 상태에 따라 노출하되 기존 Profile Owner 권한과 이미 준비된 inbound 동작은 flag와 분리

## Impact

- Profile·Follow persistence와 application/API 경계에 Profile Migration 관계, cardinality 검증과 target-first Follow 이전을 연결한다.
- Fedify inbound ActivityPub 경계와 Local Actor 표현에 Move validation, source materialization과 source alias projection을 연결한다.
- 기존 Temporal Profile Follow lifecycle을 inbound Move admission에 재사용하고 반복·재시도 경계를 검증한다.
- Settings Profile detail에 조건부 source 준비 UI와 그 상태·권한·실패 피드백을 추가한다.
- 이번 Stack 분리는 제품 계약을 바꾸지 않는다. 준비 결과를 target Profile로 단순화하고, 동시 pair 재확인을 exact pair 단일 조회로 줄이며, batch Workflow를 한 번 처리 후 `continueAsNew`하는 흐름으로 정리해 기존 idempotency·target-first·retry 결과를 보존한다.
- 새 외부 dependency나 운영자 CLI는 추가하지 않으며, 실제 운영 계정에 대한 이전 실행은 별도 승인 없이는 수행하지 않는다.
