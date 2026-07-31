## Context

현재 Local actor dispatcher는 `ensureDrizzleLocalProfileActor`를 통해 active Local Profile과 actor key를
보장한 뒤 `createLocalProfilePerson`에서 `Person`을 만든다. Profile 조회 projection에는 id, handle,
displayName, bio와 createdAt만 있어 `Profile.followPolicy`, `ProfileMedia`와 `Media`의 공개 표현을 직렬화할 수
없다.

`ProfileMedia`는 profile별 `AVATAR`/`HEADER` 관계를 하나씩 저장하고, Ready Local `Media`는 Media Storage
Service가 확정한 nullable하지 않은 URL과 Media Type을 가진다. actor/key lazy 생성과 stable actor identity는
이미 별도 경계에서 검증되고 있으므로 이번 변경은 Profile 표현 조회와 `Person` 직렬화만 확장한다.

## Goals / Non-Goals

**Goals:**

- actor 역참조가 최신 displayName, 평문 bio, avatar, header와 Follow Approval Policy를 제공한다.
- actor document와 후속 outbound Update가 재사용할 수 있는 canonical `Person` projection을 유지한다.
- Ready Local Media의 저장된 공개 URL과 Media Type만 ActivityPub 이미지로 제공한다.
- 기존 actor/key lazy 생성과 identity·endpoint 계약을 보존한다.

**Non-Goals:**

- outbound `Update(Person)` activity 생성과 전달
- Profile Tag·Profile Link federation 표현
- Remote Media materialization, 이미지 proxy/cache 또는 추가 metadata fetch
- DB/GraphQL schema, Profile 편집 UI, actor key lifecycle 변경

## Implementation Guidance

### Current Constraints

- `LocalActorStore.findActiveLocalProfile`은 actor/key 생성 전 같은 transaction에서 Profile을 읽고 있으며 현재
  Media 관계를 반환하지 않는다.
- avatar와 header는 같은 `ProfileMedia`/`Media` 테이블을 서로 다른 kind로 참조하므로 단순 join 하나로 두
  관계를 구분할 수 없다.
- `ProfileMedia.profileId`와 `Media.profileId`는 각각 FK지만 서로 같은 Profile이라는 DB constraint는 없다.
  actor projection은 편집 service가 보장한 소유 관계를 조회 조건에서도 확인해야 한다.
- Fedify `Person`은 `icon`/`image`에 vocabulary `Image` object를, `manuallyApprovesFollowers`에 boolean을
  받는다. 저장 문자열을 그대로 임의 JSON으로 조립하면 JSON-LD와 media type 직렬화가 기존 library 경계와
  갈라진다.
- actor document 요청은 local actor metadata와 key가 없으면 이를 lazy 생성한다. 표현 조회 확장이 이 기존
  idempotent transaction 흐름을 제거하거나 별도 key identity를 만들면 안 된다.

### Recommended Approach

Local Profile projection에 `followPolicy`와 선택적 avatar/header의 URL·Media Type을 추가한다. Drizzle 조회는
avatar/header 각각에 alias를 둔 left join을 사용하고, 같은 Profile 소유·Local source·Ready state·공개
metadata 존재 조건을 만족하는 Media만 projection에 포함하는 방식을 기본으로 한다.

`createLocalProfilePerson`은 이 projection에서 avatar/header가 있을 때만 Fedify `Image`를 만들고 각각
`icon`/`image`로 전달한다. `manuallyApprovesFollowers`는 follow policy를 명시적인 boolean으로 매핑한다.
displayName, 평문 bio, identity, endpoint와 key 구성은 기존 `Person` 생성 경계에 유지한다. 따라서 actor
dispatcher와 후속 delivery caller가 같은 생성 함수를 사용하면 같은 object 표현을 얻는다.

통합 테스트는 실제 actor HTTP 응답 JSON을 기준으로 OPEN/APPROVAL_REQUIRED, bio와 Media의 존재·부재,
이미지 교체·제거 뒤 최신 표현, 기존 actor/key row 재사용을 검증한다. 순수 `Person` 생성 단위 테스트가
projection mapping 실패를 더 명확히 드러내면 함께 둘 수 있다.

### Allowed Alternatives

avatar/header를 alias join 대신 Profile 조회 뒤 최대 두 개의 bounded Media 조회로 조합해도 된다. 같은
transaction snapshot, Profile 소유·Local/Ready·metadata 조건과 단일 canonical `Person` 생성 경계를
유지해야 한다.

### Known Traps

- `ProfileMedia` kind만 확인하고 `Media.profileId`를 확인하지 않아 잘못 연결된 다른 Profile Media를 공개하는
  것
- Uploading, Remote 또는 URL/Media Type이 없는 Media를 placeholder나 불완전한 `Image`로 제공하는 것
- avatar/header URL을 storage reference나 origin path에서 다시 조립하는 것
- actor HTTP 응답과 outbound Update용 `Person`을 별도 helper에서 서로 다르게 조립하는 것
- Media 표현을 추가하면서 actor/key lazy 생성이나 기존 endpoint identity를 바꾸는 것

## Risks / Trade-offs

- [actor 조회 join이 늘어나 read 비용이 증가한다] → profile별 최대 두 관계이며 index와 unique constraint가
  있으므로 bounded 조회를 유지하고 통합 테스트에서 query 결과 중복을 확인한다.
- [legacy 또는 손상된 Media 관계가 actor 응답을 실패시킬 수 있다] → projection eligibility를 조회 경계에서
  확인하고 유효한 공개 URL/Media Type을 만들 수 없는 선택 관계는 노출하지 않는다.
- [일부 원격 구현이 header `image` 또는 명시적 false policy를 다르게 소비할 수 있다] → ActivityPub vocabulary
  object와 boolean을 Fedify로 직렬화하고 Kosmo 내부 JSON shape를 별도로 만들지 않는다.

## Migration Plan

DB migration과 backfill은 없다. 배포 뒤 actor 역참조는 즉시 최신 저장 Profile/Media를 반영한다. 문제가
발생하면 projection 필드 추가를 되돌려 기존 최소 actor 문서로 rollback할 수 있으며 저장 데이터와 actor/key
identity에는 영향이 없다.

## Open Questions

없음.
