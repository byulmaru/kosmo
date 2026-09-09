## Why

현재 Create는 저장된 전달 Actor를 작성자로 사용한다. 다른 Actor가 전달한 미저장 원문은 이 경로로 안전하게 저장할 수 없다. 기존 production helper와 PROD-465의 10,000자 수신 한계 위에 작성자 확인과 독립된 Actor/Post 저장을 연결해 후속 원문 조회가 같은 행동을 재사용하게 한다.

## What Changes

- typed Note의 요청 IRI·object identity·단일 attribution을 검증하고 exact URI로 작성자를 확인한다.
- 저장된 작성자는 재사용하고, 미저장 작성자는 PROD-248의 Actor lookup/projection/persistence 정책으로 materialize한다.
- 신규 원문 조회는 검증된 PUBLIC/UNLISTED Note를 `inReplyTo` 유무와 관계없이 허용한다. Parent는 DB identity lookup으로만 연결하고 미해석·부적합한 경우에만 null fallback한다. DB 장애나 예상하지 못한 오류는 전파한다. 기존 Create의 Reply·Followers Only·Media 동작은 보존한다.
- Media는 기존 앞 4개 embedded 이미지·추가 fetch 없음·선택 후보 실패 시 전체 거부 계약을 재사용한다. attachment-only는 허용하고 본문과 유효 이미지가 모두 없는 신규 Note는 거부한다. 기존 Create 동작은 유지한다.
- content/media 등 Note 검증과 수신 한계 확인은 신규 author persistence보다 먼저 완료하며 실제 Actor와 attribution의 exact URI 일치도 저장 전에 검증한다.
- Actor/Profile·Instance 확보와 Post 저장은 기존 독립 경계를 유지한다. 유효 Actor commit 후 Post 실패·duplicate에서도 작성자를 보상 삭제하지 않는다. author+Post 전체 transaction을 위한 API 재설계는 제외한다.
- 기존 `createPost`를 재사용하며 object URI의 first-write-wins, 동시 최초 저장과 rollback을 공통 경계에서 보장한다.
- Create를 첫 production consumer로 연결한다. Announce Repost/Undo, Quote resolution, signed-fetch identity, Update/Delete 구현은 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`의 Post 구조·조회 정책·ActivityPub Local Note 표현, `docs/domain/objects/post-content.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/architecture/core-services.md`.
- Linear Contract: [PROD-509](https://linear.app/byulmaru/issue/PROD-509)의 목적·포함 범위·완료 기준·2026-09-09 Reply·최소 helper 흡수 및 Media·독립 저장 경계 사용자 확정.
- Linear Implementations: PROD-509가 이 change의 구현·Create 회귀·통합 검증·delta 동기화·archive를 소유한다. 부모 관계나 PR 순서로 책임을 추론하지 않는다.
- Prerequisites: [PROD-465](https://linear.app/byulmaru/issue/PROD-465)의 정규화한 summary/body Plain Text 합계 10,000자(UTF-16 `.length`) 수신 한계. PROD-661은 이 이슈에 흡수되어 Canceled이며 선행 조건이 아니다. PROD-506과 PROD-931은 관련 후속 범위다. Actor 정책은 [PROD-248](https://linear.app/byulmaru/issue/PROD-248), 본문 projection은 [PROD-259](https://linear.app/byulmaru/issue/PROD-259)를 재사용한다.
- 사용자 결정(2026-09-09): 스펙은 main에서 준비하고 구현 때 선행 스택에 연결한다.

## Capabilities

### New Capabilities

- `activitypub-remote-note-materialization`: 검증한 원격 Note의 작성자 확인, 허용 입력과 원자적 최초 저장을 공통 application 경계로 제공한다.

### Modified Capabilities

- `activitypub-remote-media`: 기존 Media 처리 규칙을 PROD-509에 적용하고 Post/첨부 Media 원자성이 별도 Actor commit을 되돌리지 않음을 명확히 한다.
- `activitypub-remote-reply-ingestion`: 기존 Create의 identity·attribution 검증을 보존하면서 DB Parent lookup·null fallback·first-write-wins를 신규 PUBLIC/UNLISTED materialization에도 적용한다. DB 장애와 예상하지 못한 오류는 fallback 대상에서 제외한다.

## Impact

- 예상 영향: `packages/fedify/src/inbound-create.ts`, `packages/fedify/src/inbound-create-note.ts`, `packages/fedify/src/remote-actor-materialization.ts`, 실제 필요한 최소 audience·Reply helper, `packages/core/services/post.ts`와 관련 DB 통합 테스트.
- GraphQL schema, canonical PostContent schema와 DB schema를 변경할 필요는 현재 확인되지 않았다. 새 generic fetcher, loader wrapper, hydration abstraction이나 Post 저장 엔진을 만들지 않는다.
- PROD-510은 Announce의 unknown Note 소비와 Repost를, PROD-792는 Quote resolution을, PROD-793은 Local Follower 선택·인증 조회·권한 재검증을 별도로 소유한다. 이 change의 완료에 이들의 구현을 포함하지 않는다.
- 현재 스펙 base는 main이다. 구현 PR은 PROD-465 결과를 포함한 선행 스택의 최상단 위에 연결한다. 직전 부모와 SHA는 구현 시 최신 상태로 확인하며, 선행 작업이 완료됐다고 간주하지 않는다.

- PROD-509는 기존 `projectRemoteNoteContent`, `projectRemoteNoteMedia`, `createPost`를 재사용하고 Create 전용 audience 분류·`inReplyTo` 해석·Parent lookup/fallback 중 실제로 필요한 최소 로직만 추출한다. 전체 Note projector·두 단계 projection API는 추가하지 않는다.
- Parent fetch·재귀 materialization·기존 fallback 관계 update/backfill은 PROD-506에 남긴다. raw `inReplyTo` 미보존으로 자동 복구를 보장할 수 없지만 이 후속 공백은 최초 저장 완료를 막지 않는다.
- Quote Source가 Reply여도 Source 자체의 identity·author·audience를 사용한다. Parent로 대체하지 않으며 private 신규 허용과 Quote 승인·Source 노출 책임을 넓히지 않는다.
