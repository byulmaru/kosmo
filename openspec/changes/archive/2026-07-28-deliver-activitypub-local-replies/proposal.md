## Why

Local Reply는 Kosmo 안에서 생성·삭제되고 안정적인 ActivityPub Note identity와 표현도 제공되지만, 그 lifecycle이
원격 Parent 작성자의 inbox로 전달되지 않는다. PROD-494의 공통 Local Note 경계와 PROD-447의
post-commit failure isolation이 준비되었으므로, 이제 Reply 생성·삭제를 기존 Fedify delivery 경계에 연결한다.

## What Changes

- 처음 생성된 Local Reply를 기존 Local Note 표현을 포함한 `Create(Note)`로 전달한다.
- Reply 삭제를 같은 canonical Note identity를 가리키는 `Delete`로 전달한다.
- Fedify Context와 local actor/Note identity를 Reply Author Profile의 Local Instance `canonicalOrigin`에서 파생한다.
- Public/Unlisted Reply의 원격 직접 Parent 작성자를 현재 저장 상태에서 direct recipient로 선택한다.
- outbound followers fanout은 공통 Fedify dispatcher를 소유하는 PROD-512로 분리한다.
- domain transaction commit 뒤 Fedify로 직접 전달하고, delivery 실패를 관측하되 committed application 결과는
  성공으로 유지한다.
- duplicate application action 또는 delivery 재호출에서도 같은 Post에 대해 안정적인 activity identity와
  Create/Delete ordering domain을 사용한다.
- transactional outbox, NATS, Fedify MessageQueue, durable retry와 delivery history는 구현하지 않고 PROD-448의
  후속 migration으로 유지한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`,
  `docs/domain/decisions/0010-post-interaction-contracts.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/architecture/core-services.md`
- Linear Contract: PROD-497
- Linear Implementations: PROD-497. PROD-494는 Local Note identity·표현 기반, PROD-447은 현재 post-commit failure
  isolation 계약, PROD-448은 별도 후속 migration을 소유한다.

## Capabilities

### New Capabilities

- `activitypub-local-reply-delivery`: Local Reply의 `Create(Note)`·`Delete` activity, recipient, identity,
  post-commit delivery와 failure isolation을 정의한다.

### Modified Capabilities

없음.

## Impact

- `packages/fedify`: 기존 Local Note projection을 재사용하는 Reply Create/Delete activity 구성, Parent recipient 조회와
  직접 delivery
- `apps/api`: Local Reply 생성·삭제 transaction commit 이후 delivery 호출과 오류 격리
- `packages/core`: 기존 Post·Reply Parent·ActivityPub Actor 저장 계약을 조회에 재사용하며 새 schema나
  migration은 추가하지 않음
- 운영 제약: API process가 remote HTTP delivery를 직접 기다리고 commit과 delivery 사이 process 종료 시 activity가
  유실될 수 있는 현재 제한을 유지함
