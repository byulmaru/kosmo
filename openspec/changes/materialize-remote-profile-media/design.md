## Context

`packages/fedify`의 원격 actor materialization은 하나의 DB transaction에서 Profile과 ActivityPubActor를
생성·갱신하며, 검색 최초 lookup, stale refresh와 inbound `Update(Actor)`가 이 경계를 공유한다. `Media`와
`ProfileMedia`는 이미 Remote Ready 표현과 avatar/header GraphQL 조회를 지원하지만 actor projection은
`icon`/`image`를 읽지 않는다. 현재 Remote Media URL partial unique index는 URL만 포함해 서로 다른 원격
Profile이 공용 이미지를 소유할 수 없다.

## Goals / Non-Goals

**Goals:**

- hydrated actor의 embedded avatar/header 후보를 추가 network fetch 없이 검증한다.
- actor scalar, endpoint와 Profile 표현을 같은 materialization transaction에서 동기화한다.
- 같은 Profile+URL을 재사용하고 다른 Profile의 공용 URL은 별도 Media identity로 허용한다.
- 기존 Profile GraphQL 및 앱 소비자를 변경하지 않고 실제 이미지를 노출한다.

**Non-Goals:**

- IRI-only 표현 hydration, image byte fetch, proxy/cache와 파생 이미지
- orphan Remote Media 삭제
- GraphQL schema, client UI와 Local Profile 편집 변경

## Implementation Guidance

### Current Constraints

- Fedify accessor는 IRI-only property를 dereference할 수 있으므로 호출 시 network를 거부하는 document/context
  loader와 `suppressError`를 사용해야 한다.
- `Image.urls`는 URL 또는 Link를 포함할 수 있으며, 지원 후보는 정확히 하나의 HTTP(S) URL만 가져야 한다.
- Profile row는 Media보다 먼저 존재해야 하므로 최초 생성 경로는 Profile insert 뒤 같은 transaction에서
  표현을 저장해야 한다.
- 기존 URL-only unique index와 Post Remote Media 조회는 Profile 범위 identity로 함께 바꾸지 않으면 schema와
  application semantics가 어긋난다.
- 같은 actor를 더 새로운 `lastFetchedAt`으로 먼저 반영한 경우 기존 stale-write guard는 표현 관계에도 그대로
  적용되어야 한다.

### Recommended Approach

actor projection 단계에서 avatar/header를 nullable Remote Media 후보로 만든다. materialization transaction
안에서 Profile insert/update 후 각 후보를 `(profileId, url)` conflict identity로 생성 또는 조회하고 metadata를
갱신한 뒤, kind별 ProfileMedia를 upsert한다. 후보가 null이면 해당 kind 관계만 삭제한다. 기존 Media row는
다른 Post 또는 과거 관계가 참조할 수 있으므로 삭제하지 않는다.

Remote Media partial unique index를 `(profile_id, url)`로 변경하고 원격 Post Media materialization query와
conflict 처리를 같은 identity에 맞춘다. GraphQL은 이미 ProfileMedia에서 Ready URL Media를 읽으므로 resolver나
client 변경 없이 API 통합 테스트로 결과만 검증한다.

### Allowed Alternatives

kind별 관계를 delete 후 insert하거나 conflict update로 교체할 수 있다. 단, 같은 transaction, kind별 유일성,
최신 actor refresh 우선과 기존 Media 비삭제 계약을 보존해야 한다.

### Known Traps

- `getIcon()`/`getImage()`에 기본 loader를 사용해 IRI-only URL을 추가 fetch하지 않는다.
- avatar/header URL을 Profile column에 직접 저장해 Media/ProfileMedia source of truth를 중복하지 않는다.
- 표현 하나가 부적합하다는 이유로 actor 전체 materialization을 거부하지 않는다.
- URL-only uniqueness를 유지한 채 다른 Profile 소유 Media를 재사용하거나 owner를 변경하지 않는다.
- 관계가 제거됐다는 이유로 Remote Media를 삭제해 기존 PostContent 참조를 깨뜨리지 않는다.

## Risks / Trade-offs

- [표현 제거가 orphan Remote Media를 남김] → 참조 안정성을 우선하고 cleanup은 별도 lifecycle 계약으로 미룬다.
- [IRI-only avatar/header는 계속 표시되지 않음] → 새 resource budget과 fetch 정책 없이 embedded 상호운용
  범위를 먼저 지원한다.
- [동일 URL의 Profile별 Media가 저장량을 늘림] → Media의 원본 Profile 소유권과 공용 기본 이미지
  상호운용성을 보존한다.

## Migration Plan

기존 URL-only Remote Media unique index를 제거하고 `(profile_id, url)` partial unique index를 생성한다. 기존
데이터는 전역 unique라 새 복합 unique도 자동으로 만족하므로 backfill은 필요 없다. rollback은 새로 생성될 수
있는 Profile별 동일 URL row 때문에 이전 URL-only index를 즉시 복원할 수 없으므로, 애플리케이션 rollback
전 중복 URL 존재 여부를 확인하고 이전 schema로의 contract migration을 별도 수행해야 한다.

## Open Questions

없음.
