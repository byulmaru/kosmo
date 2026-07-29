## Why

현재 Local Reply delivery 구현은 일반 `Create(Note)`에 이미 포함된 `inReplyTo` 차이를 별도 interaction으로
취급하고, Reply 전용 helper가 actor·inbox 조회와 실제 Fedify 전달까지 소유한다. 일반 Local Post delivery와
공통 recipient 확장 경계를 함께 만들면 Root Post와 Reply가 같은 lifecycle을 사용하고 후속 interaction도
inbox·followers 조회를 복제하지 않을 수 있다.

## What Changes

- direct remote Profile target과 Author followers target을 공통 `Recipient` 집합으로 확장하는 outbound
  dispatcher를 추가한다.
- dispatcher가 remote Instance/Profile eligibility, actor·personal/shared inbox 검증, deduplication과 Fedify
  `sendActivity` 호출을 소유한다.
- 모든 Local content Post의 생성과 삭제를 PROD-494의 Note identity·projection을 재사용한 일반
  `Create(Note)`·`Delete(Note URI)` lifecycle로 연결한다.
- Root Post와 Reply가 같은 activity 구성과 dispatcher를 사용하며, Reply는 기존 Note의 `inReplyTo`와
  Public/Unlisted remote Parent author target만 추가한다.
- Reply 전용 delivery capability와 helper 경계를 제거한다.
- Repost dispatcher migration은 PROD-534, durable outbox·queue migration은 PROD-448의 후속 범위로 유지한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`,
  `docs/domain/objects/profile.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`,
  `docs/architecture/core-services.md`
- Linear Contract: PROD-512
- Linear Implementations: PROD-512. PROD-497은 PROD-512의 Duplicate이고, PROD-534는 Repost migration을
  별도 후속으로 소유한다.

## Capabilities

### New Capabilities

- `activitypub-outbound-recipient-dispatch`: 논리적 direct Profile·followers target을 usable Fedify Recipient로
  확장하고 실제 direct delivery를 수행하는 공통 경계
- `activitypub-local-post-delivery`: Root Post와 Reply를 구분하지 않는 Local content Post의
  `Create(Note)`·`Delete(Note URI)` lifecycle, target 의미와 failure isolation

### Modified Capabilities

- `activitypub-local-reply-delivery`: Reply 전용 activity·recipient·delivery lifecycle을 제거하고 일반 Local
  Post delivery capability로 migration한다.

## Impact

- `packages/fedify`: 공통 recipient dispatcher, 일반 Local Post Create/Delete 구성과 Author Instance별 signing
  context
- `packages/core`: 통합 `createPost`·`deletePost`에서 Local content Post lifecycle을 실행하고 committed 결과와
  delivery 실패를 격리
- `apps/api`: GraphQL resolver의 인증·payload mapping 책임을 유지하고 Fedify orchestration을 추가하지 않음
- OpenSpec: `activitypub-local-reply-delivery` active capability를 제거하고 두 일반 capability로 대체
- 운영 제약: PROD-448 전까지 API process가 remote HTTP delivery를 직접 기다리고 commit과 delivery 사이
  process 종료 또는 caller-owned transaction 경로에서 activity가 유실될 수 있음
