## Context

2026-09-08 PROD-902 최신 본문, canonical 문서와 현재 대화의 명시적 선택을 독립 확인했다.
아래 기록은 상위 계약을 다시 정리한 Derived Contract이며 새 내부 구현 수단을 강제하지 않는다.
Spec Gate 최종 승인은 별도이며 이 기록의 Active가 제품 구현 승인을 뜻하지 않는다.

## Decision Records

### D1 게시글별 자동 승인과 모두 초기값

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0027-quote-consent-and-federation.md`, PROD-902, PROD-924.
- Status: Active
- Context / Problem: 설정 단위·기존 글 초기값과 기존 승인의 처리 기준이 필요했다.
- Decision Outcome: 게시글별 모두·팔로워·본인만 자동 승인을 사용하고 새 글·기존 Local Post 모두 초기값을 모두로 한다. 사용자가 이번 사이클 범위를 게시글별로 선택했다.
- Alternatives Considered: Profile 기본값은 별도 Backlog로 분리했다. 기존 글을 본인만으로 초기화하거나 기존 승인을 일괄 철회하는 방안은 선택하지 않았다.
- Consequences: 정책 변경은 이후 요청에만 적용한다. Profile 기본값 PROD-925는 현재 완료 조건이 아니다.
- Confirmation / Follow-up: 새/기존 글 초기값, 권한, Follow와 Follow Request 구분, 기존 승인 비소급을 검증한다.

### D2 원격 승인 대기 중 본문 선게시

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `docs/domain/decisions/0027-quote-consent-and-federation.md`, PROD-902, PROD-431, PROD-924.
- Status: Active
- Context / Problem: 원격 타인 원문 승인을 기다리는 동안 자체 본문 게시와 Source 노출을 구분해야 한다.
- Decision Outcome: 사용자가 채택한 계약대로 본문을 먼저 게시·일반 전달하고 승인 전 Source는 정상 인용으로 노출하지 않는다. Kosmo 자체 건별 수동 승인 UI는 제외한다.
- Alternatives Considered: 전체 게시를 승인까지 보류하거나 승인 없이 Source를 먼저 노출하는 방안은 채택하지 않았다.
- Consequences: Accept와 유효한 승인 후 연결·Update, Reject·실패 중 본문 보존을 구분한다.
- Confirmation / Follow-up: pending 게시·발신, 잘못된 Accept, 유효한 승인 후 같은 identity 갱신을 검증한다.

### D3 타인 Source 공개 범위와 자기 인용

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0027-quote-consent-and-federation.md`, PROD-902, PROD-431, PROD-924.
- Status: Active
- Context / Problem: 조회 가능한 타인의 제한 공개 글까지 재증폭할지 결정해야 했다.
- Decision Outcome: 타인 Local·Remote Source는 Public·Unlisted만 허용한다. 자기 Followers Only 인용은 Source 접근 범위를 유지한다.
- Alternatives Considered: 조회 가능한 타인의 Followers Only 인용은 선택하지 않았다. Direct·Mentioned Profiles·조회 불가 Source도 제외한다.
- Consequences: 원격 수신 PROD-792·793 계약은 별도로 유지한다. Parent와 Source의 권한은 독립이다.
- Confirmation / Follow-up: 타인 Followers Only 거부, 자기 인용의 viewer별 접근, 기존 저장 관계의 조회를 보존한다.

### D4 삭제·정책 변경·차단·철회의 서로 다른 결과

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0027-quote-consent-and-federation.md`, PROD-902, PROD-924.
- Status: Active
- Context / Problem: 원문 제어가 Quote 작성자의 본문과 제3자 조회에 미치는 범위를 정해야 했다.
- Decision Outcome: 삭제·거절·철회 후 본문을 유지하고 Source를 숨긴다. 차단은 당사자 접근·새 요청을 막되 기존 승인을 자동 철회하지 않는다. 제3자 Source 비노출은 명시적 철회이며, 로컬 Quote가 수신한 유효한 철회는 기존 Quote audience에도 전달한다.
- Alternatives Considered: 정책 변경·차단에 따른 일괄 자동 철회와 Source 삭제에 따른 Quote 전체 삭제는 채택하지 않았다.
- Consequences: 기존 승인으로 차단을 우회할 수 없고, 명시적 철회는 해당 승인을 무효화해 원격에 전달한다.
- Confirmation / Follow-up: 당사자와 제3자의 차이, 명시적 철회, Quote audience 전달, 원문 삭제, 본문 보존을 검증한다.

### D5 FEP 승인과 레거시 발신 표현

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0027-quote-consent-and-federation.md`, PROD-902, PROD-924.
- Status: Active
- Context / Problem: 인용 지원 여부가 다른 서버에도 승인된 원문 참조를 전달해야 한다.
- Decision Outcome: FEP를 정식 경로로 쓰며 승인 후 quoteUrl·quoteUri·\_misskey_quote와 원문 링크 fallback을 제공한다. 사용자가 속성 3종과 본문 링크 제공을 선택했다.
- Alternatives Considered: 속성 3종만 제공하는 방안은 선택하지 않았다. invalid FEP를 legacy로 강등하는 방안은 승인 우회이므로 제외한다.
- Consequences: QuoteAuthorization 역참조는 Source 조회 권한을 적용하고 `interactingObject`를 embed하지 않는다. 권한이 없거나 이를 확인할 수 없으면 승인 객체를 제공하지 않는다. 철회 `Delete`의 `object`와 `target`에는 객체를 embed하지 않는다. 승인 전·거절·철회 때 자동 생성 표현을 숨기고 직접 작성한 Content·링크는 유지한다.
- Confirmation / Follow-up: 권한별 승인 객체 readback과 무권한 비제공, 철회 payload의 URI 참조·embed 제한, 승인 후 호환 payload와 철회 후 자동 표현 제거, 사용자 본문 보존을 검증한다.

### D6 스펙 소유권과 구현·archive 책임

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0027-quote-consent-and-federation.md`, `memory/issue-openspec-workflow.md`, PROD-902, PROD-431, PROD-924.
- Status: Active
- Context / Problem: 스펙 작성 세션을 구현 이슈로 이동하려던 해석이 사용자 요청과 달랐다.
- Decision Outcome: 사용자 정정에 따라 PROD-902가 이 OpenSpec을 소유한다. PROD-431·924가 담당 task를 구현하며 PROD-924는 전체 선언 task와 연합 통합 검증 후 archive를 수행한다.
- Alternatives Considered: PROD-924 소유의 별도 스펙으로 이동하거나 이슈 수만큼 계약을 복제하지 않는다.
- Consequences: 스펙 작성과 제품 구현 승인은 별개다. PROD-792·793의 독립 change 완료를 대신 처리하지 않는다.
- Confirmation / Follow-up: 현재 issue-scope와 task owner, 전체 완료·sync·archive 증거를 대조한다.

### D7 로컬 작성 범위는 기본 Quote로 한정

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0027-quote-consent-and-federation.md`, `docs/design/post-action-bar.md`, PROD-431·902·924의 2026-09-09 범위 정정과 PROD-431 사용자 지시.
- Status: Active
- Context / Problem: 이전 미구현 작성 초안에 Reply+Quote API와 링크 인용 UX가 포함됐다.
- Decision Outcome: 사용자가 해당 기능 전체와 문서 제거를 지시했으므로 기본 Quote 작성만 제공한다. Quote 작성에 Reply Parent를 추가하지 않으며 링크를 인용 카드로 전환하지 않는다.
- Alternatives Considered: Reply+Quote API만 유지하거나 대체 UI를 만드는 안도 사용자가 제외했다.
- Consequences: 기존 Reply 작성과 저장된 관계·원격 수신·조회 표현은 유지한다. 기존 PROD-431 초안은 적용 대상에서 제외하고 이 공유 change의 tasks 2~3을 사용한다. PROD-902의 이전 승인 snapshot은 이번 수정본 전체의 승인이 아니다.
- Confirmation / Follow-up: 제외된 UI·작성 조합을 노출하지 않는지, 기본 Quote와 기존 Post·Reply의 회귀를 확인한다.

### D8 원격 interactionPolicy는 승인 증거가 아닌 힌트

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0027-quote-consent-and-federation.md`, `docs/design/post-action-bar.md`, PROD-902의 2026-09-09 사용자 결정. 프로토콜 참고: [FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/).
- Status: Active
- Context / Problem: 원격 `interactionPolicy`의 automatic/manual 분류나 부재·해석 실패를 QuoteRequest 발신과 실제 승인 판단에 어떻게 사용할지 확정해야 했다.
- Decision Outcome: 자기 인용은 QuoteRequest 없이 허용한다. 타인 원문은 automatic/manual 여부와 정책 부재·해석 실패에 관계없이 자체 Content를 pending으로 게시하고 QuoteRequest를 보낸다. `interactionPolicy`는 작성 UI와 예상 eligibility의 힌트일 뿐이며, 실제 승인은 해당 Quote·Source에 결속한 유효한 QuoteAuthorization으로만 확인한다.
- Alternatives Considered: manual 광고가 있을 때만 요청하거나 automatic 광고 자체를 승인으로 보는 방안, 정책 부재·해석 실패 시 작성을 거부하는 방안은 채택하지 않았다.
- Consequences: 작성자가 automatic/manual 어느 쪽에도 명백히 포함되지 않으면 승인 가능성이 낮다는 안내에 사용할 수 있지만, 그 정보만으로 승인 또는 거절을 확정하지 않는다. 승인 전에는 Source와 자동 생성 FEP·legacy·fallback을 숨기며, 승인 후 같은 Post에 Source를 활성화하고 필요한 Update를 전달한다.
- Confirmation / Follow-up: 자기 인용, automatic, manual, 정책 부재·해석 실패, 어느 집합에도 포함되지 않는 경우와 유효·무효 QuoteAuthorization을 각각 검증한다.

## Remaining Decisions

- 현재 범위의 미결정 제품 정책은 없다. Profile 기본값은 현재 계약의 승인 근거가 아닌 PROD-925 Backlog다.
- 내부 저장 표현·API 이름·UI 배치·재시도 수는 design의 비규범 가이드와 기존 계약을 만족하는 범위에서 정한다.
  공개 동작·권한·데이터·호환성에 영향을 주는 추가 선택이 드러나면 상위 결정부터 갱신한다.

## Superseded Decisions

- OpenSpec 안에서 대체된 기존 결정은 없다. 작성 전의 ‘PROD-902는 OpenSpec 제외, PROD-924에서 스펙 작성’
  해석은 사용자 정정과 Linear 갱신으로 폐기했다. 현재 결정은 D6이며 당시 기록은 조사 record에 보존한다.
