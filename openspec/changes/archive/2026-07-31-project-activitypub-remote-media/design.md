## Context

현재 Fedify inbound handler는 원격 Note의 text/HTML과 summary를 core projection으로 바꾼 뒤 `createPost()`에 완성된 document를 전달한다. `createPost()`는 ActivityPub Post mapping을 포함한 Post/PostContent transaction과 object URI unique conflict의 first-write-wins를 이미 소유하지만, Remote Media 입력과 persistence는 없다.

`media` table은 Local upload lifecycle에서 시작해 `account_id`, `storage_reference`, `upload_expires_at`이 non-null이다. Remote Media는 같은 논리 테이블을 사용하되 이 Local upload field가 없고, 원격 URL을 기존 nullable `url` column에 저장해야 한다. 현재 checkout의 active `attach-local-media-to-post` change가 PostContent V1 Media node와 최대 4개 제한을 제공한다.

## Goals / Non-Goals

**Goals:**

- embedded Image와 Media Type이 `image/*`인 embedded Document attachment를 추가 fetch 없이 검증한다.
- Remote Media를 재사용하거나 생성한 뒤 Media node가 포함된 document를 기존 원격 Post transaction에서 저장한다.
- Local과 Remote Media field 조합, Remote URL uniqueness와 duplicate/concurrent first-write-wins를 database에서 지지한다.
- 기존 text-only/HTML remote Note와 Local upload 동작을 유지한다.

**Non-Goals:**

- attachment IRI hydration, 이미지 byte fetch, proxy/cache 또는 Media Storage Service 복제
- Update(Note), Profile avatar/header, client image renderer와 새로운 GraphQL Media field
- Local Note outbound attachment task 또는 active `attach-local-media-to-post` change의 archive

## Implementation Guidance

### Current Constraints

- Fedify `Object.getAttachments()`는 embedded object뿐 아니라 IRI를 document loader로 resolve할 수 있으므로 그대로 호출하면 이 change가 새 request-time fetch 경계를 만들 수 있다.
- 원격 content document는 Media ID를 알기 전에 projection되지만, Media ID는 transaction 안의 insert/reuse 결과로만 알 수 있다.
- `createPost()` 밖에서 Media를 먼저 만들면 object URI duplicate나 Post 저장 실패 때 orphan Media가 남는다.
- `media.url`은 Local Media에도 사용하므로 일반 unique constraint는 서로 다른 Local upload 결과까지 합칠 수 있다.
- physical NOT NULL을 해제할 세 Local upload field는 application type에서도 nullable이 되므로 Local caller가 nullable 값을 잘못 허용하지 않도록 source별 validation과 DB check가 함께 필요하다.

### Recommended Approach

Fedify adapter는 network를 수행하지 않는 loader 경계로 embedded attachment만 순회하고 Image 또는 Media Type의 MIME essence가 `image/*`인 Document를 primitive `{ url, mediaType, altText }` 후보로 만든다. 다른 타입과 IRI-only attachment는 제외하고 원래 순서의 앞 네 이미지 attachment만 후보로 유지한다. Image는 Media Type이 없어도 후보로 수용하고, Document의 malformed/non-image Media Type은 지원하지 않는 attachment로 제외한다. URL은 WHATWG URL로 HTTP(S)와 canonical serialization을 검증하며, 유지한 후보 하나라도 부적합하거나 canonical URL이 중복되면 materialization을 시작하지 않는다. 다섯 번째 이후 이미지 attachment는 상세 projection과 persistence 없이 무시한다.

core의 ActivityPub `createPost` 입력에 protocol-neutral한 remote media 후보를 추가한다. 기존 transaction에서 Post와 ActivityPub mapping을 먼저 insert해 duplicate object를 조기에 판정한 뒤, 후보 URL의 Remote Media를 conflict-safe insert/reuse하고 owner Profile이 같은지 확인한다. attachment name은 생성 또는 재사용한 Media의 nullable Alt Text로 저장하고, 얻은 Media ID만 이미 projection된 canonical document 끝의 Media node로 결합해 canonicalize한 뒤 PostContent를 저장한다. transaction 자체는 지금처럼 object URI conflict만 duplicate no-op으로 정규화하고, URL ownership conflict나 다른 오류는 전체 rollback한다.

schema migration은 `account_id`, `storage_reference`, `upload_expires_at`의 physical NOT NULL을 해제하고, source/state별 CHECK로 Local Uploading/Ready와 Remote Ready 조합을 강제한다. `source=REMOTE`에만 적용되는 URL partial unique index를 추가한다. PR #428 이전 dev의 Ready Local row는 Media Storage Service의 실제 representation metadata로 사전 백필해 CHECK 적용 전 누락을 0개로 만든다.

### Allowed Alternatives

- `createPost()`가 transaction을 계속 소유한다는 조건에서, Remote Media insert/reuse와 document 결합을 별도 core private helper 또는 service로 분리할 수 있다.
- embedded attachment를 network 없이 얻는 방법은 Fedify public API와 테스트 seam에 맞춰 선택할 수 있으나, IRI hydration이나 custom JSON-LD parser를 추가할 수 없다.

### Known Traps

- attachment URL을 `storageReference` 또는 새 `remote_url`에 저장하지 않는다.
- remote URL unique conflict를 ActivityPub object URI duplicate로 오인해 유효한 기존 Post 결과처럼 삼키지 않는다.
- `onConflictDoNothing()` 뒤 URL만으로 Media를 읽고 다른 작성자의 Media를 재사용하지 않는다.
- rich HTML paragraph document를 Plain Text로 되돌린 뒤 Media를 붙이지 않는다. 기존 canonical paragraph/link 구조를 보존한다.
- 네 개 초과 정책을 Note 전체 거부로 바꾸거나 뒤의 Image를 임의 선택하지 않는다. 원래 순서의 앞 네 개만 사용한다.
- migration을 위해 기존 Local Media를 삭제하거나 synthetic URL/media type을 만들지 않는다. 백필은 Media Storage Service가 실제 반환한 representation metadata만 사용한다.

## Risks / Trade-offs

- [IRI-only Image는 표시되지 않음] → 새 network/resource-budget 경계를 만들지 않고 embedded interoperable subset을 먼저 지원하며 별도 capability에서 hydration을 확장한다.
- [앞 네 개 안의 잘못된 Image 하나가 Note 전체를 거부함] → 일부 attachment만 보이는 표현 왜곡과 orphan persistence를 피하고 structured rejection test로 관측한다.
- [다섯 번째 이후 Image는 표시되지 않음] → PostContent V1의 최대 네 개 계약을 유지하고 원래 순서의 deterministic prefix를 저장한다.
- [같은 URL을 서로 다른 작성자가 재사용하면 후속 Note가 거부됨] → canonical Media ownership을 보존하며 URL identity 정책을 완화하려면 먼저 Media domain을 변경한다.
- [partial unique insert race] → database uniqueness 후 같은 transaction에서 owner를 다시 읽어 검증하고 conflict 전체를 rollback한다.

## Migration Plan

1. URL/media type이 없는 기존 Ready Local row를 storage reference별 Media Storage Service representation으로 백필하고 누락이 0개인지 확인한다.
2. 세 Local upload field의 NOT NULL을 해제하고 source/state CHECK 및 Remote URL partial unique index를 추가한다.
3. 같은 release의 application code가 Remote Media variant와 기존 Local variant를 source/state에 맞게 기록한다.
4. prod에는 현재 `media` table이 없으므로 최초 schema부터 invariant를 적용한다. dev rollback은 PR #428 이후 완료 경로만 허용하며 URL/media type 없이 READY로 전환하는 이전 workload로 되돌리지 않는다.

## Open Questions

없음.
