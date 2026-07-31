## Context

`packages/fedify`의 원격 actor materialization은 하나의 DB transaction에서 Profile과 ActivityPubActor를
생성·갱신하며, 검색 최초 lookup, stale refresh와 inbound `Update(Actor)`가 이 경계를 공유한다. `Media`와
`ProfileMedia`는 이미 Remote Ready 표현과 avatar/header GraphQL 조회를 지원하지만 actor projection은
`icon`/`image`를 읽지 않는다. 현재 Remote Media URL partial unique index는 URL만 포함해 서로 다른 원격
Profile이 공용 이미지를 소유할 수 없고, 같은 URL의 독립된 표현 metadata를 서로 덮어쓴다.

## Goals / Non-Goals

**Goals:**

- hydrated actor의 embedded avatar/header 후보를 추가 network fetch 없이 검증한다.
- actor scalar, endpoint와 Profile 표현을 같은 materialization transaction에서 동기화한다.
- Remote URL을 Media identity로 사용하지 않고 각 Post attachment와 Profile 표현 문맥의 Media를 분리한다.
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
- 기존 URL-only unique index와 Post Remote Media URL 조회/reuse를 함께 제거하지 않으면 schema와 application
  semantics가 어긋난다.
- 같은 actor를 더 새로운 `lastFetchedAt`으로 먼저 반영한 경우 기존 stale-write guard는 표현 관계에도 그대로
  적용되어야 한다.

### Recommended Approach

actor projection 단계에서 avatar/header를 nullable Remote Media 후보로 만든다. materialization transaction
안에서 Profile insert/update 후 kind별 현재 ProfileMedia 관계를 조회한다. 같은 kind의 현재 Media가 같은 URL을
계속 가리키면 그 Media의 metadata만 갱신하고, 현재 관계가 없거나 URL이 바뀌면 새 Media를 생성해 관계를
upsert한다. 후보가 null이면 해당 kind 관계만 삭제한다. avatar/header가 같은 URL이어도 서로의 관계를
재사용하지 않는다. 기존 Media row는 다른 Post 또는 과거 관계가 참조할 수 있으므로 삭제하지 않는다.

Remote Media URL partial unique index를 제거하고 원격 Post의 attachment 후보마다 새 Media를 생성한다. URL
기반 conflict 처리나 기존 Media 조회는 하지 않는다. GraphQL은 이미 ProfileMedia에서 Ready URL Media를
읽으므로 resolver나 client 변경 없이 API 통합 테스트로 결과만 검증한다.

무중단 transition binary는 insert를 먼저 시도하고 compatibility index가 충돌을 반환하는 동안에만 같은
Profile+URL Media를 fallback으로 사용한다. fallback은 기존 metadata를 덮어쓰지 않는다. avatar/header의 현재
관계가 한 Media를 공유하면 매 refresh에서 분리를 다시 시도하므로 contract 뒤 첫 refresh에서 자동으로 별도
Media가 된다. contract 뒤에는 같은 binary의 insert가 성공하므로 URL 조회/reuse 경로를 타지 않는다.

### Allowed Alternatives

kind별 관계를 delete 후 insert하거나 conflict update로 교체할 수 있다. 단, 같은 transaction, kind별 유일성,
최신 actor refresh 우선과 기존 Media 비삭제 계약을 보존해야 한다.

### Known Traps

- `getIcon()`/`getImage()`에 기본 loader를 사용해 IRI-only URL을 추가 fetch하지 않는다.
- avatar/header URL을 Profile column에 직접 저장해 Media/ProfileMedia source of truth를 중복하지 않는다.
- 표현 하나가 부적합하다는 이유로 actor 전체 materialization을 거부하지 않는다.
- URL이 같다는 이유로 다른 attachment, Profile, avatar/header Media를 재사용하거나 metadata를 덮어쓰지 않는다.
- 관계가 제거됐다는 이유로 Remote Media를 삭제해 기존 PostContent 참조를 깨뜨리지 않는다.

## Risks / Trade-offs

- [표현 제거가 orphan Remote Media를 남김] → 참조 안정성을 우선하고 cleanup은 별도 lifecycle 계약으로 미룬다.
- [IRI-only avatar/header는 계속 표시되지 않음] → 새 resource budget과 fetch 정책 없이 embedded 상호운용
  범위를 먼저 지원한다.
- [동일 URL의 독립 Media가 저장량을 늘림] → URL은 identity가 아니므로 표현별 metadata와 참조 안정성을
  우선한다. byte dedupe는 Media Storage Service의 별도 책임이다.

## Migration Plan

무중단 전환은 두 release로 나눈다.

1. PROD-625 transition release에서 기존 전역 URL unique index를 구버전과 신버전이 모두 사용할 수 있는
   `(profile_id, url)` compatibility index로 바꾸고, 신버전을 index 유무에 모두 호환되게 배포한다. 이 단계에는
   contract SQL을 포함하지 않는다.
2. production active/preview와 rollback 대상 구버전이 모두 배수되고 rollback window 종료 및 contract 승인을
   확인한 뒤 PROD-627의 별도 release에서 compatibility index만 제거한다. 기존 row와 참조는 rewrite하지 않는다.

contract 이후에는 같은 URL의 독립 Media가 생성될 수 있으므로 URL identity 동작으로의 애플리케이션 rollback은
지원하지 않는다. 실패 시 자동 down migration 대신 forward migration 또는 승인된 restore 절차를 사용한다.

## Open Questions

없음.
