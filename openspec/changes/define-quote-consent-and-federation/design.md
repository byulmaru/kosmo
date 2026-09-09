## Context

계약·스펙 owner는 PROD-902다. 같은 계약의 로컬 작성은 PROD-431, 게시글별 정책·발신·승인·철회와 연합
통합 검증은 PROD-924가 맡는다. PROD-792·793의 기존 수신·signed fetch 구현을 이 change에서 복제하지 않는다.

Canonical 근거는 `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`, ADR 0027과
`docs/design/post-action-bar.md`다. 2026-09-08 사용자의 정책 선택과 스펙 소유권 정정을 Linear에서 확인했다.

## Goals / Non-Goals

**Goals:**

- 게시글별 인용 허용과 원문 작성자의 철회를 실제 작성·조회·발신 결과에 일관되게 적용한다.
- 자체 Content의 게시와 Source 인용 승인을 분리하고 원격 응답·삭제·차단 이후에도 두 결과를 구분한다.
- 일반 Note·기존 Post·공통 dispatcher·effects 경계를 재사용하고 구현 이슈별 완료 증거를 연결한다.

**Non-Goals:**

- Profile 기본값 PROD-925, Kosmo 자체 건별 수동 승인 UI, 인용 알림·목록, 사용자용 본문 수정.
- 별도 Quote durable 객체나 Kind, 기존 원격 수신·signed fetch·Repost·Profile Block UI 재구현.
- PROD-902 세션에서 제품 코드 구현 또는 change archive.

## Implementation Guidance

### Current Constraints

- `packages/core/db/tables.ts`와 `packages/core/services/post-structure.ts`에는 Content·Reply Parent·Repost
  Source 조합이 있다. Content 없는 `repostPost`는 Quote 작성 경로가 아니다.
- `apps/api/src/graphql/resolvers/post/mutation/create.ts`의 생성 입력과 `packages/core/services/post.ts`의
  LocalPostInput은 조사 시점에 Source 입력을 받지 않는다. PROD-431의 작성 연결이 필요하다.
- 기존 `Post.repostSource`와 카드가 Source FK의 존재를 최종 승인으로 해석하면 pending·철회 시 원문이
  노출된다. 조회 판단에 승인과 viewer별 Source 접근을 모두 연결해야 한다.
- `packages/fedify/src/local-post-note.ts`에는 Quote 전용 projection이 없고 기존 Create/Delete 경로를
  사용한다. 승인 후 Update는 이 change의 발신 lifecycle에서 연결할 부분이다.
- 설치된 Fedify와 vocabulary는 2.3.0이다. 최신 문서의 helper 존재를 현재 dependency의 가용성으로
  추론하지 않는다. 도입 시 package export와 공식 문서를 대조하고 의존성 변경은 pnpm CLI를 사용한다.
- 원격 수신 저장 상태와 source-author 검증 입력은 PROD-792·793이 소유한다. 로컬 작성 제한 때문에
  원격 Followers Only 수신 계약을 줄이지 않는다.

### Recommended Approach

아래는 구현 출발점이며 내부 이름이나 저장 구조를 고정하는 규범이 아니다.

1. 먼저 게시글 정책과 요청 판정·조회 판정을 연결한다. 정책 값, 자기 인용, established Follow, Block과
   Source 조회 여부를 읽는 기존 경계를 재사용한다. 초기값은 새 글·기존 글 모두 `모두`다.
2. PROD-431은 자체 Content와 인용 대상 정보의 원자적 작성을 연결하고, 자기 인용이 아닌 원격 타인 원문은
   `interactionPolicy`와 관계없이 Quote를 pending으로 게시한다. 요청 가능 여부와 최종 승인 여부를
   API·클라이언트에서 혼동하지 않도록 결과를 구분한다.
3. PROD-924는 요청에 대응하는 Quote·Source·발급자와 처리된 응답의 순서를 식별할 수 있도록 승인 정보를
   보존한다. FK는 승인 상태가 아니므로 Source projection은 별도 승인 판정과 기존 접근 판정을 통과시킨다.
4. 일반 Note projection을 공유해 자체 Content를 먼저 전달하고 원문 서버에 QuoteRequest를 보낸다. 자기 인용은
   요청 없이 허용한다. 타인 원문의 `interactionPolicy`는 automatic/manual 분류나 부재·해석 실패 모두
   사전 힌트로만 사용하며 승인 증거로 사용하지 않는다. 승인이 유효해진 뒤 같은 Post identity로 Source·승인을
   포함한 Update를 전달한다. source-author의 Accept/Reject와 승인 객체의 대응을 검증한다.
5. 승인된 projection에 세 호환 속성과 원문 링크 fallback을 추가한다. 같은 Source identity를 사용하고,
   fallback은 저장된 PostContent 수정이 아닌 발신 표현으로 구성하는 접근을 권장한다. 자동 생성한 부분을
   구분해 철회 시 제거하고 작성자 본문은 보존한다. `quote-inline`과 `RE:` 표현은 공식 구현의 참고 예시다.
6. 명시적 철회·삭제·차단을 각각 처리한다. 철회는 승인 무효화와 원격 신호, 삭제는 기존 삭제 계약,
   차단은 당사자 접근 제한을 담당한다. 같은 effect로 모두 묶어 기존 승인을 자동 철회하지 않는다.
7. 기존 post-commit effects와 공통 delivery에 연결한다. commit된 자체 Content와 delivery 실패를 구분하고
   중복·동시·stale 응답은 최신 승인 결과를 바꾸지 않도록 검증한다. 재시도 횟수나 Workflow type·ID는
   현재 공통 runtime 정책을 확인한 뒤 정한다. PROD-792의 재시도 수를 발신에 그대로 복제하지 않는다.

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

게시글별 정책의 구체적인 GraphQL field·mutation 이름, payload와 오류 shape는 위 공개 행동·권한·초기값을
만족하는 범위에서 PROD-924가 구현 시 확정한다. 해당 선택과 schema·migration·backfill·rollback 증거를
PROD-924의 구현 PR과 통합 검증에 남긴다.

## PROD-431 작성 구현 가이드

2026-09-09 사용자 지시로 기본 Quote 작성만 제공한다. 기존 `add-local-quote-creation` 초안은 적용하지 않는다.
그 초안에서 전제한 타인 Followers Only 허용, 승인 상태 없는 Source 노출, migration 불필요는 현재 계약과 다르다.

- API는 기존 `CreatePostInput`에 optional `repostSourceId`를 추가하는 접근을 권장한다. concrete Post global ID를
  기존 resolver 경계에서 해석하고 core에 DB identity를 전달한다. 생략·null은 기존 Post·Reply 동작이다.
  Source와 Parent를 함께 받는 작성 조합은 허용하지 않는다. Source 입력 자체의 shape와 기존 payload를 유지한다.
- `packages/core/services/post.ts`의 기존 transaction에서 Media·Content와 인용 대상 정보를 기록한다.
  Source의 Content·조회·공개 범위·정책·차단을 제출 시 다시 확인한다. 부적격 Source의 존재를 오류로 노출하지
  않으며, transaction 실패는 Media metadata까지 rollback한다. post-commit 효과 실패는 게시 실패와 구분한다.
- PROD-924가 소유한 정책·요청 판정·승인 상태 저장 경계를 먼저 대조한다. 승인 정보 없이 FK만 추가해 작성이나
  조회를 배포하지 않는다. 실제 저장 표현은 양쪽 구현이 공유해야 하며 PROD-431이 임의의 두 번째 승인 모델을
  만들지 않는다. 현재 코드에는 해당 경계가 없으므로 작업 시작 시 PROD-924의 구현·설계 상태를 확인한다.
- menu eligibility를 순수 Repost의 계산에 그대로 종속시키지 않는다. `인용하기`는 조회 가능하고 인용 조건에 맞는
  Content Post에서 기본 Composer를 열며 Source 자체의 direct preview를 표시한다. Reply Parent 선택·링크
  자동 전환·새 검색기는 제공하지 않는다. 본문·Media·Content Warning·Sensitive Media·Visibility를 재사용한다.
- `PostComposer`의 기존 요청 context generation에 Source identity를 포함하는 접근을 권장한다. selected Profile·
  Environment·draft 전환이나 unmount 뒤 늦은 응답이 새 draft와 navigation을 변경하지 않게 한다.
- 서버가 반환한 Post는 기존 `@prependNode`와 관리 대상 Home connection에 반영한다. 없는 connection을 합성하거나
  Source의 Repost count·viewerRepost를 Quote 성공으로 변경하지 않는다. 성공 Post가 포함된 nullable field 오류와
  Post 없는 실패를 구분한다. 승인 대기 성공에서는 서버의 null Source를 유지한다.
- 승인·철회 뒤 재조회한 같은 Post identity에서 Source가 바뀌는지 확인한다. 서버 승인 lifecycle을 클라이언트에서
  추측하거나 별도 polling·subscription 기능을 이 스펙만으로 추가하지 않는다. 기존 화면 재조회 경계를 재사용한다.

## Open Questions

현재 제품 정책의 미답변은 없다. 정책 API의 구체적인 field·mutation 이름, payload·오류 shape, 저장 schema,
재시도 수와 구체 UI 배치는 PROD-924가 위 가이드와 기존 계약을 만족하도록 정하는 구현 선택이다. 의미 있는
공개 계약·권한·데이터·호환성 변경이 필요하면 구현자가 독단으로 선택하지 않고 PROD-902의 결정을 갱신한다.

공식 참고: [FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/),
[Mastodon ActivityPub](https://docs.joinmastodon.org/spec/activitypub/),
[Hackers’ Pub Quote inbox](https://github.com/hackers-pub/hackerspub/blob/e21745bf4657371156d8056328b5c44c3e77acdd/federation/inbox/quote.ts).
Mastodon 고정 parser는 `3b6daf7ba7b49eb8b97557e6dc7877335cf5ab38`을 조사했다. Hackers’ Pub outbound serializer
전체의 호환 규칙을 확인했다고 주장하지 않으며, Kosmo의 발신 표현은 사용자 선택과 canonical 계약을 따른다.
