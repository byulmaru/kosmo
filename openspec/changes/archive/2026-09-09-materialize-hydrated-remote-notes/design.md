## Context

PROD-509는 기존 production helper와 PROD-465의 10,000자 수신 한계를 사용해 검증된 원격 Note의 작성자 확인과 최초 저장을 연결한다. 2026-09-09 사용자 결정으로 PROD-661을 흡수하고 PUBLIC/UNLISTED Reply Note를 포함한다. 전체 Note projector나 두 단계 projection API를 전제로 하지 않는다.

권위는 canonical `docs/domain/objects/post.md`의 「원격 Note의 최초 materialization과 Reply Parent」, 최신 PROD-509·465 및 사용자 확정이다. 기존 Create·Followers Only·Media 계약은 보존한다. 원문 바이트·HTML 구조·canonical JSON·hydration 응답 보호는 PROD-931의 후속 범위이며 PROD-509 blocker가 아니다.

## Goals / Non-Goals

**Goals:**

- 전달 Actor와 구분되는 attribution 작성자를 검증하고 기존 Actor/Post persistence로 원문을 저장한다.
- 신규 원문 조회와 기존 Create의 서로 다른 허용 입력을 유지하며 기존 helper와 저장을 공유한다.
- 실패·중복·동시 최초 저장, resource budget과 Post commit 뒤 effects를 검증한다.

**Non-Goals:**

Announce Repost/Undo, Quote 승인·resolution·revision, signed-fetch 주체 선택, 원격 Reply Parent 탐색, DIRECT/Mention 권한, 별도 Media 정책·추가 attachment fetch, author+Post 전체 transaction을 위한 API 재설계, Update/Delete, durable retry/receipt, generic loader와 새 Post 저장 엔진은 포함하지 않는다.

## Implementation Guidance

### Current Constraints

- `inbound-create.ts`는 저장된 delivery actor와 object cardinality를 확인한다. 이를 미저장 원문의 attributed author 검증과 섞으면 Create 인증 범위가 넓어진다.
- `inbound-create-note.ts`는 typed Note 검증, audience/relevance, Reply Parent 조회, projection과 `createPost` 호출을 연결한다. audience 분류와 private `resolveReplyParentId` 및 Parent-specific `createPost` fallback은 현재 Create에 묶여 있다. 필요한 부분만 이 이슈에서 추출한다. `projectRemoteNoteContent`와 `projectRemoteNoteMedia`는 이미 재사용 가능한 production 함수다.
- `findOrMaterializeRemoteProfileActorByUri`는 exact URI의 저장 Actor를 재사용한다. 미저장 URI는 Fedify `getActorHandle`와 기존 Actor materialization을 사용한다. 현재 마지막 exact URI 확인은 Actor persistence 뒤이므로, 509는 실제 Actor URI와 Note attribution의 exact 일치를 persistence 전에 검증하도록 기존 경계에 필요한 최소 수정을 한다. 저장 후 검출에 의존하거나 잘못된 Actor/Profile을 저장·재연결하지 않는다.
- Actor 저장과 `createPost`는 각각 자체 transaction을 열고 외부 transaction을 받지 않는다. 사용자 결정에 따라 이 독립성을 유지한다. 유효한 Actor commit 후 Post 실패·duplicate에서도 Actor와 Profile 표현을 보존한다. Instance 확보도 별도 경계이며 Note/Post 실패로 삭제하지 않는다.
- `createPost`는 transaction commit 뒤 Post 생성 effects Workflow를 시작한다. 이 이슈는 transaction 합류를 도입하지 않으며 기존 Post commit/effects 순서를 보존한다. Post 실패·duplicate에서는 effects를 시작하지 않고 commit 후 effects 실패는 저장 결과를 유지한다.
- Actor lookup의 legacy availability/refresh 정책과 URI lookup의 복구 옵션은 다르다. 새 consumer에 기존 helper를 연결했다는 이유로 unavailable Actor를 무조건 재활성화하거나 refresh하지 않는다. 현재 Actor 정책과 검증 증거를 확인한다.

### Recommended Approach

1. 구현 착수 때 PROD-465의 10,000자 계약과 구현·검증 증거를 확인하고 이를 포함한 부모 SHA를 기록한다.
2. Fedify 경계가 기존 hydration과 protocol 검증을 맡고, 기존 `projectRemoteNoteContent`, `projectRemoteNoteMedia`, `createPost`를 조합한다. 신규 원문 action 안에서 exact object/attribution과 PUBLIC/UNLISTED audience, content/media·10,000자 제한을 author persistence 전에 검사한다. attachment-only는 허용하고 본문과 유효 이미지가 모두 없는 Note는 이 신규 경로에서 거부한다. `inReplyTo` 해석은 `uniqueHref`·`isHttpUri`, Parent 조회는 기존 `findPostByActivityPubUri`를 사용한다. audience와 Parent lookup/fallback의 실제 공통 부분만 추출한다. 기존 Create 진입점은 자신의 envelope/relevance 검증을 유지한다.
3. 저장 Actor는 exact URI로 재사용한다. 미저장 Actor는 기존 lookup/projection을 재사용하되 실제 Actor URI와 attribution의 exact 일치를 Actor persistence 전에 반드시 검증한다. 기존 lookup/projection/persistence 경계의 최소 수정으로 해결하며 네트워크 호출을 장시간 DB transaction에 넣지 않는다. 두 단계 projection API를 만들지 않는다.
4. 기존 Actor persistence를 독립 commit한 뒤 기존 `createPost`를 호출한다. Actor 내부 저장 실패는 해당 Profile·Actor·Profile 표현을 rollback하고, Post 저장 실패는 Post·Content·mapping·첨부 Media·최초 Parent 관계만 rollback한다. 유효한 작성자와 Instance는 보상 삭제하지 않는다. DB 장애와 예상하지 못한 오류는 전파한다. Fedify vocabulary 타입은 core public input에 넣지 않고 canonical 값과 검증된 identity만 전달한다. DB mutation과 transaction은 `docs/architecture/core-services.md` 경계를 따른다.
5. 성공한 Post commit 뒤 기존 effects를 실행한다. 성공한 신규 저장과 duplicate/no-op, 정상적인 지원 범위 거절, 예상하지 못한 저장 오류를 구분하며 후속 consumer가 임의로 거절을 성공으로 취급하지 않게 한다. 구체 함수명·파일·결과 union은 구현에서 정한다.
6. 기존 Create를 같은 경계로 전환하고 정상·거절·Reply·Followers Only·Media 회귀를 확인한다. 후속 Announce/Quote consumer 구현은 추가하지 않는다.

### Media 검증과 저장 순서

기존 `projectRemoteNoteMedia`가 embedded Image 및 MIME type이 image인 Document 중 원래 순서의 앞 4개를 선택한다. IRI-only·지원하지 않는 attachment·초과분은 추가 fetch 없이 제외한다. 선택된 후보의 URL이 없거나 복수이거나 HTTP(S)가 아니면 Note 전체를 거부한다. 일부 이미지 제거 후 본문만 저장하는 재시도는 하지 않는다. 원본 nullable Media Type·Alt Text와 같은 URL의 attachment별 identity를 유지한다.

content/media 검증과 완전 empty 판정은 author persistence 전에 수행한다. 본문이 없는 Note도 유효 이미지가 있으면 기존 empty paragraph와 Media node로 저장한다. 기존 Create에는 신규 empty 거부 조건을 일괄 적용하지 않는다. raw metadata hydration·Image/Document 분류와 문자열 보존은 기존 helper를 따르며 추가 MIME/Alt 정책을 만들지 않는다.

### Reply Parent와 Source의 처리 경계

- `resolveReplyParentId`의 URI 해석과 `findPostByActivityPubUri` 조합을 재사용한다. Local canonical identity와 Remote exact mapping을 조회하고 Parent를 원격 fetch하지 않는다.
- 미해석 identity·Parent 부재·기존 Post 계약상 부적합한 Parent만 null fallback한다. lookup 후 Parent가 사라지거나 부적합해지는 경우에도 기존 Parent-specific NotFound/`replyParentId` ValidationError만 대상으로 삼는다. DB 장애와 다른 ValidationError 등 예상하지 못한 오류는 전파한다.
- Parent 조회와 `createPost` 조합 중 실제 중복되는 부분만 공유한다. content/media를 다시 감싼 전체 projector나 두 단계 API를 만들지 않는다. inbox relevance와 Create actor 일치 검증은 기존 진입점에 남긴다.
- Source가 Reply일 때 Source 자신의 identity·author·audience로 저장한다. Parent visibility나 Parent author를 Source에 적용하지 않는다. Quote approval과 viewer별 Source 노출은 PROD-792가 소유한다.
- duplicate는 기존 null Parent를 포함한 최초 관계를 유지한다. Parent fetch·재귀 materialization·기존 관계 update/backfill은 PROD-506에 남긴다.

### Allowed Alternatives

공통 action의 파일 배치와 private helper 분리는 고정하지 않는다. Actor/Post 독립 transaction은 확정된 계약이며 전체 합류 방식은 대안으로 두지 않는다. protocol 검증과 core domain 정책의 책임, exact identity, 원자성 및 post-commit 계약을 지키면 기존 모듈 내부 정리나 최소한의 production 전용 composition으로 구현할 수 있다. 검증을 caller callback에 맡기는 public strategy, 새 generic hydration 계층 또는 Actor/Post persistence 복제는 대안이 아니다.

### Known Traps

- delivery actor와 다른 attribution을 허용하는 원문 action을 이용해 Create의 actor 일치 검증을 제거한다.
- DB 장애 또는 예상하지 못한 오류를 잡아 Parent 없는 정상 저장으로 바꾼다. Parent-specific 부재·부적합에 한해 null fallback해야 한다.
- projection이 거절한 content를 평문·다른 visibility로 재시도해 저장한다.
- Actor 저장 뒤 exact URI 불일치를 확인하고 이미 commit된 row를 남긴다.
- Post unique conflict에서 Post·Content·mapping의 부분 row를 남긴다. 앞서 유효하게 저장된 작성자 row는 보존하며 보상 삭제하지 않는다.
- 최종 transaction이 실패했는데 effects Workflow가 이미 시작되어 있다.
- PROD-465의 10,000자 검증을 hydration 응답 보호까지 완료한 것으로 오인한다. 추가 자원 보호는 PROD-931의 후속 범위다.

## Risks / Trade-offs

- 선행 구현 확인 → PROD-465의 10,000자 한계와 초과 전체 no-op은 확정되어 있다. 구현·출시 전에 실제 결과와 테스트 증거를 재확인한다.
- 작성자 독립 commit → Post 없는 유효 Profile이 남을 수 있다. 이는 승인된 결과이며 retry에서 재사용한다. real DB rollback·경합·effects 순서와 다른 요청이 사용하는 Actor를 삭제하지 않는지 검증한다.
- Parent 복구 근거의 공백 → raw `inReplyTo`가 현재 보존되지 않아 null Parent Post의 자동 복구를 보장할 수 없다. PROD-506이 대상 식별·재검증 근거와 historical 복구 한계를 소유하며 509의 최초 저장 완료를 막지 않는다.
- 공통 API 과잉 일반화 → 현재 consumer의 고정된 production 검증만 구현하고 후속 Quote/signed-fetch의 정책 선택기를 만들지 않는다.

## Migration Plan

현재 DB migration은 예상하지 않는다. PROD-465 결과를 포함한 스택에 PROD-509 구현을 연결하고 해당 부모와 비교해 이슈 고유 diff를 검증한다. `gh-stack`으로 local/remote Stack을 확인하며 임의 reparent나 단순 PR base 변경만으로 연결 완료를 선언하지 않는다.

먼저 공통 action과 검증을 완성하고 Create를 전환한다. 전체 원자성·회귀·budget 검증 뒤 신규 경계를 후속 consumer에 인계한다. rollback은 이번 코드 전환을 되돌리되 선행 수신 한계와 이미 저장된 Post/Actor를 유지한다. 데이터 삭제나 Tombstone 복구는 rollback 수단이 아니다.

PROD-509는 자신의 공통 경계·Create 통합 검증과 이 change의 전체 task 완료 증거를 소유한다. 모든 task와 strict validation이 통과하고 delta spec이 동기화된 뒤 archive한다. 개별 PR Ready/merge를 archive 조건으로 대체하지 않는다. PROD-510·PROD-792·PROD-793의 별도 행동은 이 change의 archive를 기다리게 하는 작업이 아니다.

## Open Questions

- 남은 Human Decision은 없다. Media 기존 동작 재사용·완전 empty 신규 Note 거부·독립 Actor/Post 저장·persistence 전 exact URI 검증은 사용자 확정 사항이다.
- 선행 스택의 직전 부모·SHA와 PROD-465의 10,000자 제한 구현·검증 증거는 구현 착수 때 확인한다. 509의 스펙 초안 작성 blocker는 아니며 구현 시작/출시 gate다.
