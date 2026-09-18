## Context

계약·스펙 owner는 PROD-902다. 같은 계약의 로컬 작성은 PROD-431, 게시글별 정책·발신·승인·철회와 연합
통합 검증은 PROD-924가 맡는다. PROD-792·793의 기존 수신·signed fetch 구현을 이 change에서 복제하지 않는다.

2026-09-17 정정은 최신 main `6fc7ea5d397c4ee3e71e6494f43c0c1b86bcdd48`의 코드·canonical 문서와
독립 조회한 Linear PROD-902·924 본문·관계·댓글을 대조했다. PROD-431 PR #817의 작성 API·Composer와
Remote Source 거부 경계는 main에 병합돼 있다. 기존 보강 초안의 미병합 설명을 대체하며 구현 코드는 포함하지 않는다.

Canonical 근거는 `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`, ADR 0029과
`docs/design/post-action-bar.md`다. 2026-09-08 사용자의 정책 선택과 스펙 소유권 정정을 Linear에서 확인했다.

## Goals / Non-Goals

**Goals:**

- 게시글별 인용 허용과 원격 철회·Source 삭제 결과를 실제 작성·조회·발신에 일관되게 적용한다.
- 자체 Content의 게시와 Source 인용 승인을 분리하고 원격 응답·삭제·차단 이후에도 두 결과를 구분한다.
- 일반 Note·기존 Post·공통 dispatcher·effects 경계를 재사용하고 구현 이슈별 완료 증거를 연결한다.

**Non-Goals:**

- Profile 기본값 PROD-925, Kosmo 자체 건별 수동 승인 UI, 사용자용 개별 승인 철회 UI·API, 인용 알림·목록, 사용자용 본문 수정.
- 별도 Quote durable 객체나 Kind, 기존 원격 수신·signed fetch·Repost·Profile Block UI 재구현.
- PROD-902 세션에서 제품 코드 구현 또는 change archive.

## Implementation Guidance

### Current Constraints

- `packages/core/db/tables.ts`와 `packages/core/services/post-structure.ts`에는 Content·Reply Parent·Repost
  Source 조합이 있다. Content 없는 `repostPost`는 Quote 작성 경로가 아니다.
- 최신 main `6fc7ea5d397c4ee3e71e6494f43c0c1b86bcdd48`에는 PROD-431의 `CreatePostInput.repostSourceId`,
  `LocalPostInput.repostSourceId`와 Local Source 작성이 구현돼 있다. ActivityPub Source는 아직 명시적으로 거부한다.
- 기존 production 공개 범위 UI는 `PostComposer.tsx`의 `visibilityMenu`와 `visibilitySelector`다.
  `postVisibilityPresentation.ts`가 Public을 `공개`, Unlisted를 `조용한 공개`, Followers를 `팔로워만`으로 표시한다.
  `/compose`가 이 `PostComposer`를 사용한다. 현재 메뉴는 선택 즉시 닫히며 인용 정책 입력·상태·선택 UI는 없다.
  `docs/design/reply-composer.md`의 Visibility 계약은 같은 공개 범위 선택을 정의한다. PROD-924는 이 UI 안에
  새로운 인용 정책 선택을 추가한다. `PostComposerTarget`만 보고 현재 production 구현을 추정하지 않는다.
- 현재 `Post.repostSource` resolver는 Source ID를 반환하고 Post loader가 일반 접근 정책을 적용한다.
  기존 코드에는 Local Quote 승인 상태 판정이 없으므로, 도입 전 데이터의 신규 lifecycle 편입 여부는 그 코드만으로
  결정되지 않는다. D15가 기존 2건의 전환 계약을 보완한다.
- PROD-959로 production `PostActionSurface`의 `onQuote` 전달이 임시 중단돼 있다. Composer·기존 Quote
  표시·작성 API는 남아 있다. 이 정정에서 PROD-959의 임시 숨김을 해제하지 않는다.
- 기존 `Post.repostSource`와 카드가 Source FK의 존재를 최종 승인으로 해석하면 pending·철회 시 원문이
  노출된다. 조회 판단에 승인과 viewer별 Source 접근을 연결하되, 도입 전 두 Quote는 D15의 명시적 표시 예외로 분리한다.
- `packages/fedify/src/local-post-note.ts`에는 Quote 전용 projection이 없고 기존 Create/Delete 경로를
  사용한다. 승인 후 Update는 이 change의 발신 lifecycle에서 연결할 부분이다.
- 설치된 Fedify와 vocabulary는 2.3.0이다. 최신 문서의 helper 존재를 현재 dependency의 가용성으로
  추론하지 않는다. 도입 시 package export와 공식 문서를 대조하고 의존성 변경은 pnpm CLI를 사용한다.
- 원격 수신 저장 상태와 source-author 검증 입력은 PROD-792·793이 소유한다. 로컬 작성 제한 때문에
  원격 Followers Only 수신 계약을 줄이지 않는다.

### Recommended Approach

아래와 이어지는 PROD-924 세부 설계는 기본 구현안이다. 공개 API·권한·상태 결과는 specs와 decisions를 따르며,
내부 파일명·테이블명은 같은 정합성과 복구 가능성을 증명하면 조정할 수 있다.

1. PROD-431은 기존 Post/Repost Source 구조와 createPost transaction을 재사용해 자체 Content와 인용 대상
   정보를 원자적으로 작성한다. 작성 시 Source Content·visibility·viewer 접근·Block을 검증하고, FEP 승인이
   필요한 ActivityPub Source는 승인 경계가 없을 때 명시적으로 거부한다.
2. PROD-431의 Composer·ActionMenu·presentation은 서버 payload를 진실로 사용한다. 서버가 반환하지 않은
   Source를 낙관적으로 만들지 않는 seam을 유지하고, 정책·승인 상태·lifecycle을 별도로 구현하지 않는다.
3. PROD-924는 게시글 정책을 연결하고 요청에 대응하는 Quote·Source·발급자와 처리된 응답의 순서를 확인할 수 있도록 승인 정보를
   보존한다. FK는 승인 상태가 아니므로 Source projection은 별도 승인 판정과 기존 접근 판정을 통과시킨다.
   도입 전 두 Quote의 화면·GraphQL Source 표시에는 D15 예외를 적용하며 FEP 승인으로 승격하지 않는다.
4. 일반 Note projection을 공유해 자체 Content를 먼저 전달하고 원문 서버에 QuoteRequest를 보낸다. 자기 인용은
   요청 없이 허용한다. 타인 원문의 `interactionPolicy`는 automatic/manual 분류나 부재·해석 실패 모두
   사전 힌트로만 사용하며 승인 증거로 사용하지 않는다. 승인이 유효해진 뒤 같은 Post identity로 Source·승인을
   포함한 Update를 전달한다. source-author의 Accept/Reject와 승인 객체의 대응을 검증한다.
5. 승인된 projection에 세 호환 속성과 원문 링크 fallback을 추가한다. 같은 Source identity를 사용하고,
   fallback은 저장된 PostContent 수정이 아닌 발신 표현으로 구성하는 접근을 권장한다. 자동 생성한 부분을
   구분해 철회 시 제거하고 작성자 본문은 보존한다. `quote-inline`과 `RE:` 표현은 공식 구현의 참고 예시다.
6. 원격 승인 철회·Source 삭제·차단을 각각 처리한다. 유효한 원격 철회와 Source 삭제는 승인 무효화·전달을,
   차단은 당사자 접근 제한을 담당한다. 같은 effect로 모두 묶어 기존 승인을 자동 철회하지 않는다.
7. 기존 post-commit effects와 공통 delivery에 연결한다. commit된 자체 Content와 delivery 실패를 구분하고
   중복·동시·stale 응답은 최신 승인 결과를 바꾸지 않도록 검증한다. Activity 재시도는 현재 공통 `workflowActivityOptions`의 최대 10회·시도당 1분을 사용한다.
   아래 revision과 receipt 경계로 오래된 작업을 걸러내며 PROD-792의 resolution Workflow와는 분리한다.

### Allowed Alternatives

- 비노출 Source를 물리 관계에서 분리하거나 관계를 보존하고 조회에서 가릴 수 있다. 어느 방식을 택해도 요청
  대응 검증, pending·철회 비노출, 자체 Content 보존과 기존 Post API 계약을 만족해야 한다.
- 기존 effects 흐름에 통합하거나 별도 승인 orchestration을 연결할 수 있다. commit 이후 처리, 중복·역순
  응답 수렴과 실패 관찰 가능성을 동일하게 증명해야 한다.
- 저장 표현·API 이름·화면 배치의 선택이 공개 계약이나 제품 결과를 바꾸면 PROD-902 canonical·Linear·스펙을
  먼저 정렬한다. 이 가이드를 새로운 제품 권한의 근거로 사용하지 않는다.

### Known Traps

- 조회 가능한 타인의 Followers Only Source를 인용 가능하다고 판단하는 것.
- pending Quote 전체를 게시 보류하거나, 반대로 FK·legacy 속성을 보고 Source를 승인 없이 표시하는 것.
- automatic 광고를 개별 승인으로 대체하거나 manual 광고가 없다는 이유로 QuoteRequest를 생략하는 것.
- `interactionPolicy` 부재·해석 실패를 작성 거부로 처리하거나 다른 Source·Quote·발급자의 승인을 재사용하는 것.
- 정책 변경·차단을 기존 승인 일괄 철회로 구현하는 것.
- 승인 후 자동 삽입한 링크를 사용자 Content에 저장해 철회 때 본문까지 수정·삭제하는 것.
- 지연된 Accept, 재시도 또는 삭제 뒤의 응답으로 Source 노출을 복구하는 것.
- 기존 inbound Quote를 Local Create로 다시 발신하거나 Source URI를 delivery endpoint로 사용하는 것.

## Risks / Trade-offs

- 승인 대기 중 Source 없는 본문이 먼저 보인다 → 이후 같은 Post identity의 승인 결과를 반영한다.
- 미지원 서버는 승인 철회·Update를 반영하지 않을 수 있다 → Kosmo 상태와 outbound 신호를 검증하고 다른
  서버의 물리 삭제까지 보장한다고 주장하지 않는다.
- FEP와 helper 구현이 변할 수 있다 → 구현 시 공식 문서·설치 버전·고정 fixture를 함께 확인한다.
- 공유 change의 일부 PR만 완료될 수 있다 → PROD-902가 스펙을 유지하고 PROD-924는 전체 선언 task와
  PROD-431 연동 증거가 갖춰진 뒤 archive한다. 다른 이슈의 별도 change는 그대로 둔다.

## Migration Plan

PROD-924가 `memory/database-migrations.md`의 additive/breaking 분류를 실제 저장 diff에 적용한다. 정책 저장
구조와 도입 전 Local Post를 `모두`로 초기화하는 migration/backfill, 기존 승인 보존을 먼저 준비하고 정책
판정·조회 보호를 갖춘 뒤 작성·발신을 연결한다. backfill은 정책이 이미 지정된 글과 기존 승인을 덮어쓰지 않아야 한다.

이 스펙은 column 삭제·타입 축소 같은 breaking migration을 승인하지 않는다. 그런 변경이 필요하면 별도
expand/transition/contract 경계와 rollback 근거를 상위 이슈에 반영한다. 구버전으로 되돌릴 때 승인 검증을
잃어 Source가 노출되는 rollback은 허용하지 않는다. 이미 게시한 Content와 발급·철회 기록을 보존하면서
새 작성·발신을 중단하거나 호환 버전으로 복구할 수 있는지 배포 전 검증한다.

게시글별 정책의 GraphQL field·mutation 이름, payload와 오류 shape는 이번 공개 API 명세에서 구체화한다.
해당 계약과 schema·migration·backfill·rollback 증거를 PROD-924의 구현 PR과 통합 검증에 남긴다.

## PROD-431 작성 구현 가이드

2026-09-09 사용자 지시로 기본 Quote 작성만 제공한다. 기존 `add-local-quote-creation` 초안은 적용하지 않는다.
그 초안에서 전제한 타인 Followers Only 허용, 승인 상태 없는 Source 노출, migration 불필요는 현재 계약과 다르다.

- API는 기존 `CreatePostInput`에 optional `repostSourceId`를 추가하는 접근을 권장한다. concrete Post global ID를
  기존 resolver 경계에서 해석하고 core에 DB identity를 전달한다. 생략·null은 기존 Post·Reply 동작이다.
  Source와 Parent를 함께 받는 작성 조합은 허용하지 않는다. Source 입력 자체의 shape와 기존 payload를 유지한다.
- `packages/core/services/post.ts`의 기존 transaction에서 Media·Content와 인용 대상 정보를 기록한다.
  Source의 Content·조회·공개 범위·차단을 제출 시 다시 확인한다. 부적격 Source의 존재를 오류로 노출하지
  않으며, transaction 실패는 Media metadata까지 rollback한다. post-commit 효과 실패는 게시 실패와 구분한다.
- PROD-431은 승인 정보 없이 ActivityPub Source를 정상 Source로 노출하지 않는다. 현재 경계에서는 해당 작성에
  `Quote approval is not available` 오류를 반환한다. PROD-924는 이 안전한 거부 seam을 승인 상태와 pending
  lifecycle로 교체하며 PROD-431이 별도의 승인 모델을 만들거나 PROD-924 완료를 기다릴 필요는 없다.
- menu eligibility를 순수 Repost의 계산에 그대로 종속시키지 않는다. `인용하기`는 조회 가능하고 인용 조건에 맞는
  Content Post에서 기본 Composer를 열며 Source 자체의 direct preview를 표시한다. Reply Parent 선택·링크
  자동 전환·새 검색기는 제공하지 않는다. 본문·Media·Content Warning·Sensitive Media·Visibility를 재사용한다.
- `PostComposer`의 기존 요청 context generation에 Source identity를 포함하는 접근을 권장한다. selected Profile·
  Environment·draft 전환이나 unmount 뒤 늦은 응답이 새 draft와 navigation을 변경하지 않게 한다.
- 서버가 반환한 Post는 기존 `@prependNode`와 관리 대상 Home connection에 반영한다. 없는 connection을 합성하거나
  Source의 Repost count·viewerRepost를 Quote 성공으로 변경하지 않는다. 성공 Post가 포함된 nullable field 오류와
  Post 없는 실패를 구분한다. 승인 대기 성공에서는 서버의 null Source를 유지한다.
- PROD-431에서는 서버가 반환한 같은 Post identity와 Source를 정확히 표시하고 Source가 없는 payload를 그대로
  유지한다. 승인·철회 뒤 Source가 바뀌는 전체 federation readback은 PROD-924가 검증한다. 클라이언트에서
  lifecycle을 추측하거나 별도 polling·subscription 기능을 이 스펙만으로 추가하지 않는다.

## PROD-924 구현 설계

### 저장과 기존 Source 관계

Post 자체는 계속 `Posts`와 immutable `PostContents`를 사용한다. 인용의 Source FK를 보존하고, 관계 노출은
유효한 승인과 기존 Source 조회 정책을 함께 판정한다. 자기 인용과 D15의 기존 두 Quote 표시 예외를 구분하며,
D15를 승인 기록으로 바꾸지 않는다. 승인 저장을 `PostContent`나 새 Quote Node에 넣지 않는다.

| 저장 책임           | 기본 표현과 제약                                                                                                                                                                                                | 소비자                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Local Post 정책     | `post_quote_policy`: `post_id` PK/FK, `policy` (`EVERYONE`, `FOLLOWERS`, `AUTHOR`), 증가하는 `revision`                                                                                                         | 정책 API, Local Note projection, Local/Remote 새 인용 판정  |
| 요청·승인 lifecycle | `post_quote_consent`: Source Post FK, Quote URI, Quote Author Profile FK/Actor URI, Source Author URI, nullable Quote Post FK, 요청 URI, nullable 승인 URI, `PENDING / APPROVED / REJECTED / REVOKED`, revision | Local Quote가 받은 승인 및 Local Source가 발급한 승인       |
| 확정된 전달 복구    | transition과 같은 transaction에 최소 receipt: 승인/요청 identity, revision, 효과 종류, 원래 서명된 철회 표현의 참조와 전달에 필요한 수신자 정보                                                                 | commit 뒤 start 실패·Activity completion 유실·대상별 재전달 |

Local Source에 대한 Local Quote는 하나의 승인 기록을 공유한다. 원격 Quote가 아직 materialize되지 않아도
검증된 Quote URI·Author로 요청 결과와 승인을 보존할 수 있으며 Quote Post FK는 나중에 연결한다. 요청 URI는
고유하고, 같은 Source·Quote·Author 결속에는 유효한 승인을 하나만 둔다. 다른 identity로 같은 승인 URI를
재사용하지 않는다. 자기 인용은 승인서 면제이므로 가짜 QuoteAuthorization을 생성하지 않는다.

PROD-792의 `activitypub_post_quote`는 원격 Quote의 수신 형식·검증·resolution 상태를 소유한다. 이 테이블을
로컬 발신 상태로 재사용하거나 재정의하지 않는다. 두 경계가 같은 승인을 참조할 때는 승인 URI와 Source/Quote
identity로 연결하고, remote Quote materialization 없이도 Local Source 승인 발급이 가능하게 한다.

새 column/table은 additive로 도입한다. 정책 row가 없는 기존 Local content-bearing Post는 `EVERYONE`으로
읽고 새 쓰기에서는 정책 row를 같은 transaction에 만든다. 기존 글은 재실행 가능한 batch로 backfill하며
이미 설정된 row에는 `ON CONFLICT DO NOTHING`을 적용한다. 원격 Post와 Content 없는 Repost에는 Local 정책을
합성하지 않는다. 발급된 승인·철회 기록과 작성자 Content를 migration 때문에 변경하지 않는다.

2026-09-17 사용자 정정에 따르면 production에는 기존 Local Quote 2건이 존재한다. 이 두 Quote의 새 승인
상태나 QuoteAuthorization은 의도적으로 backfill하지 않는다. 기존 Local Post의 정책 backfill과 이미 발급된
승인 보존은 별개로 유지한다. 운영 DB를 조회해 건수를 확인한 결과로 기록하지 않는다.

기존 코드와 상위 계약만으로는 승인 기록 없는 두 Quote의 도입 후 처리를 결정할 수 없어 Human Decision으로
확인했다. 사용자는 신규 승인으로 간주하지 않는 기존 데이터 예외로 Source 표시를 유지하기로 선택했다(D15).
조회 시 승인 lifecycle에 편입되지 않은 기존 Quote로 읽는다. 저장된 승인 상태가 없다는 이유로 `PENDING`, `REJECTED`,
`REVOKED`를 합성하지 않고 `APPROVED`나 가짜 승인 객체도 만들지 않는다. 이는 새 저장 상태나 public enum 추가가 아니다.
GraphQL `Post.repostSource`와 화면 Source 표시는 확인된 두 Quote에 한해 기존 Source 조회 조건으로 판정한다.
Source 삭제·조회 불가·기존 방향별 차단 제한을 통과하지 못하면 Source만 숨기고 자체 Content는 보존한다.

활성화 전 두 Quote의 정확한 identity와 기존 Source 결속을 검토 가능한 운영 snapshot으로 확인하고, 구현은 이 두
identity를 명확히 구별해야 한다. 단순 `consent row 없음` 조건이나 생성 시각만으로 예외를 넓히지 않는다.
이 식별에는 새 승인 상태나 승인 객체를 backfill하지 않으며 범용 legacy 관리 기능을 추가하지 않는다. 새 쓰기와
조회 guard를 함께 준비하고 구버전 Quote writer가 확인되지 않은 대상을 만들지 않는지 검증한다. 대상이 두 건과
다르면 임의로 포함하거나 숨기지 않고 활성화를 보류해 범위를 재확인한다.

이 예외는 기존 Source 표시를 보존하는 계약이며 FEP 승인이 아니다. 승인 없는 두 Quote를 `APPROVED`로 광고하거나
QuoteAuthorization을 발급·역참조하거나 승인된 FEP·자동 legacy 발신 표현을 생성하는 근거로 사용하지 않는다.
일반 Content 발신과 직접 작성한 본문은 기존 계약을 따른다. 신규 Quote의 승인 누락은 이 예외로 우회하지 않는다.

### 공개 API와 기존 Relay 연결

| API                                                                                        | 입력/출력                                                         | 권한과 결과                                                                 |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `Post.quotePolicy: PostQuotePolicy`                                                        | `EVERYONE / FOLLOWERS / AUTHOR`, nullable                         | 조회 가능한 Content 있는 Local Post만 반환; 원격·Content 없는 Post는 null   |
| `Post.viewerCanUpdateQuotePolicy: Boolean!`                                                | 현재 selected Profile 기준                                        | Active Account·member·Active Local Post Author인 경우만 true                |
| `CreatePostInput.quotePolicy: PostQuotePolicy`                                             | optional; 생략·null은 `EVERYONE`                                  | 선택한 정책을 새 Post·Content와 같은 transaction에 저장                     |
| `updatePostQuotePolicy(input: UpdatePostQuotePolicyInput!): UpdatePostQuotePolicyPayload!` | `id: ID!`, `quotePolicy: PostQuotePolicy!`; payload `post: Post!` | Post concrete global ID; actor는 세션에서 결정; 변경된 같은 Post를 readback |

권한 플래그는 메뉴 표시용이다. mutation은 기존 `usingProfile` 인증 경계를 재사용하고 저장할 때 대상 Post의
정책 변경 권한을 다시 확인한다. 클라이언트는 ID 내부를 해석하거나 승인 URI를 조합하지 않는다. 사용자용 개별
승인 철회 mutation·권한 필드·UI는 제공하지 않는다.

기존 `PermissionDeniedError`, `NotFoundError`, `ValidationError`와 GraphQL error formatter를 재사용한다.
잘못된 concrete global ID·enum·필수값은 입력 오류이며, 조회 불가 대상은 부재와 구분되는 상세 정보를 주지 않는다.
권한을 확인할 수 있는 대상의 비작성자 변경은 권한 오류다. 오류를 새 성공 union이나 boolean payload로 감추지 않는다.
클라이언트는 한국어 fallback을 사용하고 DB·프로토콜 오류 원문을 그대로 표시하지 않는다.

정책 저장 결과는 요청을 보낸 actor Environment에서 같은 Post에 반영한다. selected Profile·draft·Environment가
바뀐 뒤 늦은 응답이 새 draft나 다른 actor Store를 갱신하지 않게 한다. 저장 실패는 현재 입력을 보존해 다시
시도할 수 있게 한다. 새 polling·subscription은 만들지 않는다.

### 기존 공개 범위 설정 UI 확장

`apps/app/src/components/post/PostComposer.tsx`의 기존 공개 범위 설정 UI를 재사용하고 새 인용 허용 정책 선택 UI를 추가한다. `PUBLIC`·`UNLISTED`일 때만
`인용 허용` radio group에 `모두`·`팔로워`·`본인만`을 표시한다. 공개 범위를 선택하자마자 닫는 현재 동작을
조정해 같은 UI 안에서 인용 정책까지 선택할 수 있게 한다. Web popup과 Native Modal은 기존 구성요소를 재사용한다.

새 draft의 기본값은 `EVERYONE`이며 공개·조용한 공개 사이에서는 선택값을 유지한다. 제한 공개로 바꾸면 설정을
숨기되 값을 `AUTHOR`로 강제하지 않는다. 제한 공개에서의 Source 인용 가능 범위는 별도 기존 규칙을 따른다.
Parent·Source·다른 Profile의 정책을 복사하지 않고 작성 시 현재 draft의 정책을 함께 제출한다. 이 입력과 UI 확장은
PROD-924의 task 1이며 PROD-431의 tasks 2~3 완료 조건을 확대하지 않는다.

게시된 본인 Public·Unlisted 글은 `PostMoreMenu`의 `인용 설정`에서 같은 설정 표현을 연다. 공개 범위는 읽기
전용으로 표시하고 인용 정책만 저장한다. 기존 승인은 유지된다는 설명을 제공하며 본문·visibility 편집은 추가하지
않는다. 제출 중 중복 조작을 막고 radio group 이름·현재 값·keyboard 이동, Escape·focus 복귀와 Native touch
target을 검증한다. 역방향 목록·인용별 철회 조작은 추가하지 않는다.

### Local 작성과 원격 요청의 연결

PROD-431의 `CreatePostInput.repostSourceId`, `validateQuoteSource`와 작성 transaction을 확장한다. Local Source는
현재 정책·Source visibility·양방향 Block을 검증해 허용되는 요청에 승인 기록을 만들고, 자기 인용은 요청 없이
진행한다. Remote 타인 Source는 적격 Public·Unlisted인지 확인한 뒤 Content·Source FK·PENDING 결속을 원자적으로
작성한다. 기존 `Quote approval is not available` 거부와 승인 미구현에 따른 Remote eligibility 제한은 이 경로가 연결된 뒤 해제한다. PROD-959의 별도 production 진입점 임시 숨김 해제는 이 정정에서 결정하지 않는다.

일반 `Create(Note)`와 Note dispatcher에는 pending Source·승인·자동 legacy 속성·자동 본문 링크를 넣지 않는다.
QuoteRequest는 일반 audience 발신과 다른 표현을 사용한다. `object`는 Source URI, `instrument`는 같은 Quote
identity이며 Source Author가 요청을 검증할 수 있게 후보 `quote` 관계를 제공한다. 이 요청 전용 표현은 Source
Author에게만 전달·역참조되며 승인된 공개 Quote나 일반 Note readback으로 사용하지 않는다. Quote 본문의 audience가
Source Author를 포함하지 않으면 그 본문을 요청에 embed해 접근 범위를 넓히지 않는다. 검증 가능한 최소 identity
표현과 Source 관계를 사용하고, 상호운용 상대가 본문을 요구하는 경우도 자체 Content 공개 범위를 바꾸지 않는다.

같은 Quote의 요청 identity는 retry 동안 유지한다. QuoteRequest는 Source URI에 POST하지 않고 검증된 Source
Author Actor의 inbox/sharedInbox로 기존 recipient dispatcher를 통해 보낸다. 일반 Post audience에 Source Author를
임의로 추가하지 않는다. `interactionPolicy`가 없거나 helper의 정책 판정이 denied여도 Local Remote Quote의
본문 게시·요청을 막는 조건으로 사용하지 않는다.

### 요청·승인·철회 검증과 단일 상태 전이

Fedify의 Quote vocabulary와 검증 helper를 사용하고 Kosmo의 권한·DB transaction은 core에 둔다. HTTP signature,
Actor/object/recipient authenticity는 inbox/dispatcher가 확인한다. Accept/Reject는 기존 Follow 처리 앞에서 임의로
소비하지 않고 저장된 요청 identity와 activity object 종류를 보고 분기한다. 미확인 URI를 Quote로 간주하지 않는다.

| 사건                 | 필요한 증거                                                                                         | 저장·노출 결과                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 새 Local Source 요청 | 요청 Actor, instrument의 Quote identity/author, 정확한 Source, 현재 정책·조회·양방향 Block          | 허용 시 한 승인과 Accept, 유효한 정책 거절은 Reject; 저장되지 않은 remote Quote도 지원               |
| Remote Accept        | 저장된 현재 요청 URI, Source Author의 authentic Accept, result 승인 객체의 Source·Quote·발급자 대응 | 현재 PENDING revision에서만 APPROVED, 같은 Note의 Update 예약                                        |
| Remote Reject        | 저장된 현재 요청과 Source Author 대응                                                               | PENDING을 REJECTED로 전환, 본문 보존; 과거 요청의 Reject는 다른 승인에 적용하지 않음                 |
| 원격 승인 철회       | 검증된 `Delete(QuoteAuthorization)`의 승인 identity·발급자                                          | REVOKED와 receipt commit, Source 숨김; 늦은 Accept로 복구 불가                                       |
| Source 삭제          | 해당 Source와 연결된 발급 승인 및 pending 결속                                                      | Source 조회 즉시 비노출, 발급 승인마다 철회·Quote Author delivery; 일반 Delete(Note)도 기존대로 유지 |
| Quote 삭제           | 정확한 Quote identity와 lifecycle                                                                   | 기존 Quote 삭제 결과 유지, 이후 요청/Accept effect로 Quote·Source 복구 금지                          |
| 정책 변경·Block      | 정책 revision 또는 기존 Block 관계                                                                  | 새 요청·승인에서 현재 조건 재검사; 기존 승인은 유지하고 Source 조회는 방향별 정책 적용               |

불신하는 원격 `published` 시각만으로 응답의 신구를 판단하지 않는다. 요청·승인 identity와 DB revision에 대한
조건부 update, unique constraint로 수렴시키며 명시적 비관적 락은 추가하지 않는다. 승인 fetch 전후 Source/Quote
lifecycle·현재 요청·Block을 재확인한다. fetch 실패나 무효 응답으로 유효한 기존 승인/다른 요청을 파괴하지 않는다.
같은 승인 URI의 유효한 철회는 Accept 처리보다 먼저 도착해도 기록해 나중 fetch가 그 승인을 되살리지 못하게 한다.
Unknown 철회는 authentic Source Author와 정확한 요청/승인 대응을 검증할 수 있을 때만 보존한다.

같은 요청의 재전송은 처음 확정한 결과를 사용한다. 처음 Reject한 요청을 정책 변경 뒤 다시 보내도 새 요청으로
판정하지 않는다. 자동 재요청·자동 재승인은 제공하지 않는다. 다른 요청 URI를 사용한 재승인 정책은 현재 출시
범위로 추측해 추가하지 않으며, 승인·철회 세대의 추가 UX가 필요하면 상위 결정을 먼저 받는다.

### 승인 역참조와 Note projection

승인 URI는 발급 Source origin의 독립적인 `QuoteAuthorization` dispatcher가 맡고 Source 조회 policy를 재사용한다.
Public·Unlisted Source는 기존 anonymous 조회 조건을, 제한 Source는 검증된 요청자 Actor와 기존 접근 조건을
적용한다. 차단·삭제·비활성 Source를 우회하지 않는다. `interactingObject`와 `interactionTarget`은 모두 URI만
제공하는 기본안을 사용한다. 권한 불명·부재·철회는 일관된 비제공 결과로 처리하고 승인 객체를 캐시에서 복구하지 않는다.

승인된 Note는 `quote`·`quoteAuthorization`과 `quoteUrl`, `quoteUri`, `_misskey_quote`에 같은 Source identity를
사용한다. 자기 인용은 승인 URI 없이 FEP 관계와 호환 표현을 제공한다. `PostContent`의 본문을 렌더한 뒤 별도
`quote-inline` span 안에 `RE:`와 HTML escape된 Source URI 링크를 덧붙인다. pending·거절·철회 projection에서는
이 자동 span 전체를 생성하지 않는다. 작성자가 쓴 같은 URI·문자열은 검색·삭제하지 않는다.

정책 Update와 승인 Update는 같은 Note ID·createdAt·visibility·Author를 보존하며 서로의 필드를 덮어쓰지 않는다.
각 effect는 현재 정책과 현재 승인 상태를 함께 읽어 projection을 만든다. 정책 변경만으로 Content revision을
만들거나 Repost count·viewerRepost·Source audience를 바꾸지 않는다.

### 전달, 재시도와 commit 이후 복구

현재 `postCreateEffectsWorkflow`·공용 `settleEffects`·`workflowActivityOptions`·Fedify durable queue를 재사용한다.
승인을 기다리며 일반 Create effect를 막는 장수명 Workflow는 만들지 않는다. QuoteRequest 전달·승인 후 Update·
철회는 짧은 revision별 effects로 처리하고 상태 전이는 DB가 소유한다. Workflow ID 기본안은
`post-quote-effects:{consentId}:{revision}`이며 정책 Update는 `post-quote-policy-effects:{postId}:{revision}`이다.
`USE_EXISTING`/`REJECT_DUPLICATE`와 공통 start deadline을 사용한다.

Activity는 현재 revision·lifecycle과 durable receipt를 확인한다. transient DB/network 오류는 공통 최대 10회·
시도당 1분으로 재시도하고, identity 불일치·검증 실패·stale 작업은 이유를 기록한 no-op으로 끝낸다. 재시도 소진을
REJECTED로 바꾸지 않으며 PENDING과 Source 비노출을 유지한다. Fedify queue enqueue 성공과 상대 서버 수신 성공은
구분하고 terminal queue failure도 운영 증거에 포함한다.

DB commit과 Workflow start 사이에서 프로세스가 종료돼도 동일 receipt를 재실행할 수 있어야 한다. receipt는
완료된 효과의 checkpoint를 보존하고, Worker 재시작의 bounded pending-receipt drain과 운영 재실행은 같은
identity를 사용한다. generic command ledger나 exactly-once delivery를 약속하지 않는다. 재시도마다 새 요청·승인
URI를 만드는 방식은 사용하지 않는다. receipt 정리는 해당 효과의 완료 증거를 확보한 뒤에만 수행한다.

Source 삭제는 해당 Source 승인들을 batch로 열거하고 개별 Quote Author에게 철회를 보낸다. 보통 Source audience에
없는 작성자도 포함하며 현재 Block·Follow로 기존 철회 전달을 취소하지 않는다. Quote 소유 서버는 수신한 철회의
원래 issuer·서명/proof를 보존하는 Fedify forwarding 경로를 사용한다. Local Quote Author가 Source Author를 사칭해
새 Delete를 만들지 않는다. `object`·`target`은 URI 참조만 사용하고 공개 범위를 넓히지 않는다.

한 대상의 실패가 다른 대상 전달이나 이미 commit한 철회를 rollback하지 않는다. 승인 Update가 queue에 들어간 뒤
철회가 발생하는 역순 delivery도 receiver의 승인 무효화 결과로 수렴하는지 통합 검증한다. 타 서버가 이를 무시하는
경우까지 보장하지 않으며 Kosmo 상태·발신한 신호·협력 서버 결과를 나누어 보고한다.

### Fedify 호환 검증과 인접 이슈

현재 manifest의 Fedify/vocab/postgres는 2.3.0 계열이고 `@fedify/interaction-controls`는 없다. PROD-792는
2.4 prerelease의 호환 버전 세트를 정확히 pin하고 compatibility validation을 통과한 경우에만 채택하기로 승인됐다.
구현 시작 시 PROD-792의 검증된 manifest·lockfile·실제 export와 fixture 증거를 우선 재사용한다. 아직 채택되지
않았다면 같은 조건으로 검증부터 수행하며 설치 성공을 검증 완료로 간주하지 않는다. dependency 변경은 pnpm CLI만
사용하고 수동 승인 검증기로 우회하지 않는다. 이 spec 단계에서는 후보 버전을 승인하거나 dependency를 바꾸지 않는다.

검증은 QuoteRequest 생성/검증, QuoteAuthorization authenticity, URI·embedded 객체 hydration/serialization,
Accept/Reject/Delete 및 기존 Follow·Like·EmojiReact·Announce·Note·queue 전달을 포함한다. helper의 canQuote
부재=denied 결과는 사전 힌트이며 Kosmo의 pending-first 계약과 구분한다. PROD-924는 로컬 Quote의 결과와 Local
Source 승인 발급을, PROD-792는 remote Quote read model·resolution·철회 수신을 소유한다. 공용 inbox routing과
승인 검증 연결은 실제 통합 시 중복 소비·이중 발신 없이 합친다. PROD-926에는 검증된 lifecycle 결과만 전달하고
알림 생성·정리·재알림을 구현하지 않는다.

### 구현 순서와 release evidence

1. PROD-431 PR #817의 merge 여부와 head를 다시 확인한다. 미병합 코드를 소비하면 해당 Stack top에서
   `gh stack add PROD-924`에 해당하는 정식 reparent/adopt 절차로 `main → PROD-431 → PROD-924`를 확보한다.
   이미 존재하는 명세 branch를 삭제하거나 같은 이름으로 새로 생성하지 않는다. 병합됐으면 최신 main을 통합한다.
2. 실제 schema diff를 검토하고 additive 정책 저장·기존 데이터 분류·승인 접근 보호를 준비한다. breaking이
   필요하면 이 release에 넣지 않고 별도 upstream issue·expand/transition/contract 승인을 받는다.
3. API·Worker·Fedify-consumer의 호환 버전과 역참조·철회 수신·조회 보호를 배포한 뒤 정책 조작·Remote Quote
   작성·발신을 켠다. 새 데이터가 발생하기 전에 구버전 reader가 pending FK를 노출하지 않음을 확인한다.
4. rollback은 새 작성/발신을 중단하되 기존 승인 조회 보호·철회 처리와 receipt replay가 남는 호환 빌드로 한다.
   구버전 reader를 다시 올리거나 승인 기록을 삭제하는 down migration은 사용하지 않는다. D15의 두 Quote 표시
   예외도 보존하고 신규 Quote의 승인 누락을 예외로 취급하지 않는지 rollback readback으로 검증한다.
5. PROD-431 작성→원격 pending→승인/거절→Update→철회 forwarding과 PROD-792 readback을 실제 production
   registry/dispatcher로 연결한다. 각 테스트의 commit·명령·결과와 미검증 플랫폼을 남긴다.
6. 전체 task 1~7, migration/rollback·통합 검증·spec sync가 완료된 뒤 PROD-924가 archive한다. 선행 PR 병합이나
   이번 spec validation만으로 task를 완료 표시하지 않는다.

## Open Questions

- 기존 Local Quote 2건은 사용자 확인에 따른 운영 전제다. 새 승인 상태·QuoteAuthorization은 backfill하지 않고
  D15의 기존 데이터 예외로 Source 표시를 유지한다. 활성화 직전 정확한 두 identity·Source 결속과 구버전 Quote
  writer를 확인한다. 대상이 다르면 예외를 확대하지 않고 활성화를 보류해 범위를 재확인한다.
- 공개 범위 UI 통합과 사용자용 개별 승인 철회 제외는 2026-09-11 사용자 답변으로 정했다. API 이름·nullable 의미·retry 기본안은 이 수정본의 Spec Gate에서 검토한다.
- Fedify 정확한 후보 버전과 compatibility 실행 증거, 운영 데이터 건수·receipt batch 크기·배포 image SHA는
  구현/검증 시 확인할 사실이다. 결과가 없는 값을 미리 확정하지 않는다.

공식 기술 근거(2026-09-11 확인): [FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/)의 요청·승인·철회 표현,
[Fedify interaction controls](https://unstable.fedify.dev/manual/interaction-controls)의 요청/승인 검증 helper와
정책 판정 기본값. helper 문서는 설치된 2.3.0에서 해당 export가 존재한다는 증거가 아니다. Mastodon과 Hackers’ Pub의
고정 commit fixture는 구현 compatibility 검증에서 출처·commit·입출력을 다시 확보한다.

UI 조사 근거: [Mastodon quote posts](https://docs.joinmastodon.org/user/quote-posts/)와
[client quotes](https://docs.joinmastodon.org/client/quotes/), Mastodon main
`12eb83b5646e04044857f9cc28841ada96a12411`의 `status_action_bar/index.jsx`와
`confirmation_modals/revoke_quote.tsx`를 확인했다. Mastodon의 게시글별 정책 변경과 확인 후 개별 철회 동작을
참고했으나, KOSMO는 사용자 결정에 따라 공개 범위 UI에 정책 선택을 통합하고 개별 철회는 도입하지 않는다.
Mastodon의 과거 글 기본값이나 Private 제한을 KOSMO의 초기값·공개 범위 계약으로 대체하지 않는다.
