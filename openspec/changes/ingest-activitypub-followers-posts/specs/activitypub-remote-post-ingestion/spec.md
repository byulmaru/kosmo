## MODIFIED Requirements

### Requirement: Public top-level Note validation

**Authority / Provenance:** `docs/domain/objects/post.md#activitypub-local-note-표현`, `docs/domain/objects/follow-relationship.md#조회-정책`, `PROD-360`. 시스템은 actor와 attribution이 일치하는 PUBLIC, UNLISTED 또는 검증된 Followers Only top-level `Note`만 materialization input으로 허용해야 한다(MUST). Audience visibility는 `to` Public, 그 다음 `cc` Public, 그 다음 verified author canonical followers URI의 존재를 이 순서로 확인해 분류해야 한다(MUST). 구문상 유효하게 파싱된 extra actor/collection URI는 visibility 분류나 Note 유효성에 영향을 주지 않아야 하며(MUST), raw malformed audience syntax는 기존 vocabulary hydration과 top-level Note 기본 검증에서 처리해야 한다(MUST).

#### Scenario: Hydrate a supported Note with Fedify vocabulary

- **WHEN** author eligibility가 통과하고 `Create.objectIds`의 서로 다른 URL `.href`가 정확히 하나다
- **THEN** 시스템은 `Create.getObject({ documentLoader })`로 embedded 또는 IRI-only object를 resolve한다
- **AND** custom HTTP fetch/parser를 만들지 않고 Fedify cross-origin 기본값을 유지한다
- **AND** resolved object는 object URI가 있는 `Note`이고 `Note.id.href`가 사전 검증한 object URI와 정확히 같아야 한다
- **AND** 서로 다른 attribution URI가 정확히 하나이고 activity actor URI와 같아야 한다
- **AND** reply target은 없어야 한다

#### Scenario: Preserve Public visibility with an extra mentioned actor URI

- **WHEN** verified top-level Note의 `to`에 ActivityStreams Public URI와 추가 actor URI(mention addressee)가 있다
- **THEN** materialization visibility는 PUBLIC이다
- **AND** 구문상 유효하게 파싱된 추가 actor URI의 위치·중복·foreign/unknown/spoofed-looking followers URI는 visibility를 바꾸거나 Note 전체를 무효화하지 않는다
- **AND** 시스템은 해당 URI로 Mentioned Profile 관계, Notification, DIRECT/limited recipient authorization 또는 viewer access를 만들지 않는다

#### Scenario: Preserve Unlisted visibility with an extra mentioned actor URI

- **WHEN** `to`에는 ActivityStreams Public URI가 없고 `cc`에 Public URI와 추가 actor URI(mention addressee)가 있다
- **THEN** materialization visibility는 UNLISTED다
- **AND** 구문상 유효하게 파싱된 추가 actor URI의 위치·중복·foreign/unknown/spoofed-looking followers URI는 visibility를 바꾸거나 Note 전체를 무효화하지 않는다
- **AND** PUBLIC, UNLISTED 분류의 shared inbox delivery는 local follower relevance를 추가 조건으로 요구하지 않는다
- **AND** 시스템은 해당 URI로 Mentioned Profile 관계, Notification, DIRECT/limited recipient authorization 또는 viewer access를 만들지 않는다

#### Scenario: Preserve Followers Only visibility with an extra mentioned actor URI

- **WHEN** `to`와 `cc` 모두에 Public URI가 없고 verified author의 canonical followers URI와 추가 actor URI(mention addressee)가 audience에 있다
- **THEN** materialization visibility는 FOLLOWERS다
- **AND** canonical followers marker의 중복·순서와 구문상 유효하게 파싱된 foreign/unknown/spoofed-looking followers extra actor/collection URI는 visibility를 바꾸거나 Note 전체를 무효화하지 않는다
- **AND** foreign/unknown URI를 분류하기 위한 network dereference나 `/followers` 경로 휴리스틱을 수행하지 않는다
- **AND** 시스템은 추가 URI로 Mentioned Profile 관계, Notification, DIRECT/limited recipient authorization 또는 viewer access를 만들지 않는다

#### Scenario: Skip a Note without a recognized audience marker

- **WHEN** object hydration이 실패하거나 object가 Note가 아니다
- **OR** hydrated Note ID, attribution 또는 top-level 조건이 맞지 않는다
- **OR** `to`와 `cc`에 Public URI와 verified author canonical followers URI가 모두 없고 actor-only DIRECT/limited audience 또는 foreign/unknown followers-looking URI만 있다
- **THEN** 시스템은 Profile, ActivityPub Post mapping, Post와 content side effect 없이 delivery를 skip한다
- **AND** unsupported audience를 Followers Only 권한의 근거로 사용하지 않는다
