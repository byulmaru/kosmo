## Context

2026-09-08 PROD-902 최신 본문, canonical 문서와 현재 대화의 명시적 선택을 독립 확인했다.
D1~D9은 상위 계약에서 파생한 기록이다. 2026-09-11 PROD-924 보강은 최신 canonical·Linear와
사용자 확인을 다시 읽고 공개 API·상태 수렴·rollout의 Implementation Choice를 추가한다.
Spec Gate 최종 승인은 별도이며 이 기록의 Active가 제품 구현 승인을 뜻하지 않는다.

2026-09-17 정정과 Human Decision 답변을 canonical·Linear에 반영했으며 D15가 D13을 대체한다.

## Decision Records

### D1 게시글별 자동 승인과 모두 초기값

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.
- Status: Active
- Context / Problem: 설정 단위·기존 글 초기값과 기존 승인의 처리 기준이 필요했다.
- Decision Outcome: 게시글별 모두·팔로워·본인만 자동 승인을 사용하고 새 글·기존 Local Post의 기본값을 모두로 한다. 사용자가 이번 사이클 범위를 게시글별로 선택했다. 2026-09-11 D10에 따라 새 글에서 명시한 정책은 작성과 함께 저장하며, 모두 기본값은 별도 선택이 없을 때 적용한다.
- Alternatives Considered: Profile 기본값은 별도 Backlog로 분리했다. 기존 글을 본인만으로 초기화하거나 기존 승인을 일괄 철회하는 방안은 선택하지 않았다.
- Consequences: 정책 변경은 이후 요청에만 적용한다. Profile 기본값 PROD-925는 현재 완료 조건이 아니다.
- Confirmation / Follow-up: 새/기존 글 초기값, 권한, Follow와 Follow Request 구분, 기존 승인 비소급을 검증한다.

### D2 원격 승인 대기 중 본문 선게시

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-431, PROD-924.
- Status: Active
- Context / Problem: 원격 타인 원문 승인을 기다리는 동안 자체 본문 게시와 Source 노출을 구분해야 한다.
- Decision Outcome: 사용자가 채택한 계약대로 본문을 먼저 게시·일반 전달하고 승인 전 Source는 정상 인용으로 노출하지 않는다. Kosmo 자체 건별 수동 승인 UI는 제외한다.
- Alternatives Considered: 전체 게시를 승인까지 보류하거나 승인 없이 Source를 먼저 노출하는 방안은 채택하지 않았다.
- Consequences: Accept와 유효한 승인 후 연결·Update, Reject·실패 중 본문 보존을 구분한다.
- Confirmation / Follow-up: pending 게시·발신, 잘못된 Accept, 유효한 승인 후 같은 identity 갱신을 검증한다.

### D3 타인 Source 공개 범위와 자기 인용

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-431, PROD-924.
- Status: Active
- Context / Problem: 조회 가능한 타인의 제한 공개 글까지 재증폭할지 결정해야 했다.
- Decision Outcome: 타인 Local·Remote Source는 Public·Unlisted만 허용한다. 자기 Followers Only 인용은 Source 접근 범위를 유지한다.
- Alternatives Considered: 조회 가능한 타인의 Followers Only 인용은 선택하지 않았다. Direct·Mentioned Profiles·조회 불가 Source도 제외한다.
- Consequences: 원격 수신 PROD-792·793 계약은 별도로 유지한다. Parent와 Source의 권한은 독립이다.
- Confirmation / Follow-up: 타인 Followers Only 거부, 자기 인용의 viewer별 접근, 기존 저장 관계의 조회를 보존한다.

### D4 삭제·정책 변경·차단·철회의 서로 다른 결과

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.
- Status: Superseded
- Context / Problem: 원문 제어가 Quote 작성자의 본문과 제3자 조회에 미치는 범위를 정해야 했다.
- Decision Outcome: 삭제·거절·철회 후 본문을 유지하고 Source를 숨긴다. 차단은 당사자 접근·새 요청을 막되 기존 승인을 자동 철회하지 않는다. 제3자 Source 비노출은 명시적 철회이며, 로컬 Quote가 수신한 유효한 철회는 기존 Quote audience에도 전달한다.
- Alternatives Considered: 정책 변경·차단에 따른 일괄 자동 철회와 Source 삭제에 따른 Quote 전체 삭제는 채택하지 않았다.
- Consequences: 기존 승인으로 차단을 우회할 수 없고, 명시적 철회는 해당 승인을 무효화해 원격에 전달한다.
- Confirmation / Follow-up: 당사자와 제3자의 차이, 명시적 철회, Quote audience 전달, 원문 삭제, 본문 보존을 검증한다.

2026-09-11 현재 출시의 사용자용 개별 승인 철회를 제외한 D14가 이 결정을 대체한다. 위 D4 내용은 당시 결정의 이력이다.

### D5 FEP 승인과 레거시 발신 표현

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.
- Status: Active
- Context / Problem: 인용 지원 여부가 다른 서버에도 승인된 원문 참조를 전달해야 한다.
- Decision Outcome: FEP를 정식 경로로 쓰며 승인 후 quoteUrl·quoteUri·\_misskey_quote와 원문 링크 fallback을 제공한다. 사용자가 속성 3종과 본문 링크 제공을 선택했다.
- Alternatives Considered: 속성 3종만 제공하는 방안은 선택하지 않았다. invalid FEP를 legacy로 강등하는 방안은 승인 우회이므로 제외한다.
- Consequences: QuoteAuthorization 역참조는 Source 조회 권한을 적용하고 `interactingObject`를 embed하지 않는다. 권한이 없거나 이를 확인할 수 없으면 승인 객체를 제공하지 않는다. 철회 `Delete`의 `object`와 `target`에는 객체를 embed하지 않는다. 승인 전·거절·철회 때 자동 생성 표현을 숨기고 직접 작성한 Content·링크는 유지한다.
- Confirmation / Follow-up: 권한별 승인 객체 readback과 무권한 비제공, 철회 payload의 URI 참조·embed 제한, 승인 후 호환 payload와 철회 후 자동 표현 제거, 사용자 본문 보존을 검증한다.

### D6 스펙 소유권과 구현·archive 책임

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0029-quote-consent-and-federation.md`, `memory/issue-openspec-workflow.md`, PROD-902, PROD-431, PROD-924.
- Status: Active
- Context / Problem: 스펙 작성 세션을 구현 이슈로 이동하려던 해석이 사용자 요청과 달랐다.
- Decision Outcome: 사용자 정정에 따라 PROD-902가 이 OpenSpec을 소유한다. PROD-431·924가 담당 task를 구현하며 PROD-924는 전체 선언 task와 연합 통합 검증 후 archive를 수행한다.
- Alternatives Considered: PROD-924 소유의 별도 스펙으로 이동하거나 이슈 수만큼 계약을 복제하지 않는다.
- Consequences: 스펙 작성과 제품 구현 승인은 별개다. PROD-792·793의 독립 change 완료를 대신 처리하지 않는다.
- Confirmation / Follow-up: 현재 issue-scope와 task owner, 전체 완료·sync·archive 증거를 대조한다.

### D7 로컬 작성 범위는 기본 Quote로 한정

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, `docs/design/post-action-bar.md`, PROD-431·902·924의 2026-09-09 범위 정정과 PROD-431 사용자 지시.
- Status: Active
- Context / Problem: 이전 미구현 작성 초안에 Reply+Quote API와 링크 인용 UX가 포함됐다.
- Decision Outcome: 사용자가 해당 기능 전체와 문서 제거를 지시했으므로 기본 Quote 작성만 제공한다. Quote 작성에 Reply Parent를 추가하지 않으며 링크를 인용 카드로 전환하지 않는다.
- Alternatives Considered: Reply+Quote API만 유지하거나 대체 UI를 만드는 안도 사용자가 제외했다.
- Consequences: 기존 Reply 작성과 저장된 관계·원격 수신·조회 표현은 유지한다. 기존 PROD-431 초안은 적용 대상에서 제외하고 이 공유 change의 tasks 2~3을 사용한다. PROD-902의 이전 승인 snapshot은 이번 수정본 전체의 승인이 아니다.
- Confirmation / Follow-up: 제외된 UI·작성 조합을 노출하지 않는지, 기본 Quote와 기존 Post·Reply의 회귀를 확인한다.

### D8 원격 interactionPolicy는 승인 증거가 아닌 힌트

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, `docs/design/post-action-bar.md`, PROD-902의 2026-09-09 사용자 결정. 프로토콜 참고: [FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/).
- Status: Active
- Context / Problem: 원격 `interactionPolicy`의 automatic/manual 분류나 부재·해석 실패를 QuoteRequest 발신과 실제 승인 판단에 어떻게 사용할지 확정해야 했다.
- Decision Outcome: 자기 인용은 QuoteRequest 없이 허용한다. 타인 원문은 automatic/manual 여부와 정책 부재·해석 실패에 관계없이 자체 Content를 pending으로 게시하고 QuoteRequest를 보낸다. `interactionPolicy`는 작성 UI와 예상 eligibility의 힌트일 뿐이며, 실제 승인은 해당 Quote·Source에 결속한 유효한 QuoteAuthorization으로만 확인한다.
- Alternatives Considered: manual 광고가 있을 때만 요청하거나 automatic 광고 자체를 승인으로 보는 방안, 정책 부재·해석 실패 시 작성을 거부하는 방안은 채택하지 않았다.
- Consequences: 작성자가 automatic/manual 어느 쪽에도 명백히 포함되지 않으면 승인 가능성이 낮다는 안내에 사용할 수 있지만, 그 정보만으로 승인 또는 거절을 확정하지 않는다. 승인 전에는 Source와 자동 생성 FEP·legacy·fallback을 숨기며, 승인 후 같은 Post에 Source를 활성화하고 필요한 Update를 전달한다.
- Confirmation / Follow-up: 자기 인용, automatic, manual, 정책 부재·해석 실패, 어느 집합에도 포함되지 않는 경우와 유효·무효 QuoteAuthorization을 각각 검증한다.

### D9 PROD-431 작성과 PROD-924 federation lifecycle의 완료 책임 분리

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: PROD-431, PROD-924, PR #817과 현재 사용자의 책임 분리 지시.
- Status: Active
- Context / Problem: PR #817의 기본 Quote 작성 구현이 완료됐어도 FEP-044f 원격 승인 lifecycle 미구현을 이유로 Draft 상태가 유지됐다.
- Decision Outcome: PROD-431은 기본 Quote API/core/client, 기존 Source·Composer·ActionMenu·presentation 재사용,
  작성 시 eligibility·접근·차단 검증, 원자적 Content·Source 저장과 미승인 Remote Source 비노출 seam을 맡는다.
  PROD-924는 게시글 정책과 FEP-044f QuoteRequest·Accept/Reject·QuoteAuthorization·pending·철회·Update/sync 및
  PROD-431과의 전체 federation 통합 검증을 맡는다.
- Alternatives Considered: PROD-431이 federation lifecycle 완료를 기다리거나 같은 lifecycle을 중복 구현하는 안은 채택하지 않았다.
- Consequences: tasks 2~3과 담당 회귀 검증이 완료되면 PROD-431과 PR #817은 PROD-924와 독립적으로 Ready가 될 수 있다.
  PROD-924가 작성 기반을 소비하는 동안의 Git 작업 순서는 `main → PROD-431 → PROD-924`이며 문서상 관련성을
  역방향 Stack의 근거로 사용하지 않는다.
- Confirmation / Follow-up: PROD-924는 승인 상태 없이 Source FK를 승인 증거로 사용하지 않고, 최종 sync/archive를 소유한다.

### D10 게시글 Node와 기존 공개 범위 UI에서 정책 제어

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`의 정책 변경 Mutation, `docs/design/post-action-bar.md`, `memory/graphql-style.md`, `memory/coding-style.md`, PROD-902, PROD-924의 2026-09-09 API 구체화 위임과 2026-09-11 공개 범위 UI 통합 결정.
- Status: Active
- Context / Problem: 기존 UI는 공개 범위 선택 메뉴다. 인용 정책 선택 UI는 아직 없으므로 PROD-924에서 그 메뉴 안에 새로 추가하고 게시 후에도 같은 설정 표현으로 변경해야 한다.
- Decision Outcome: `PostQuotePolicy`와 `Post.quotePolicy`, `viewerCanUpdateQuotePolicy`를 제공한다. optional `CreatePostInput.quotePolicy`를 같은 작성 transaction에 저장하고 생략·null은 `EVERYONE`으로 처리한다. `updatePostQuotePolicy`는 Post ID·정책을 받아 변경된 `post: Post!`를 반환한다. UI는 Public·Unlisted에서만 인용 정책을 표시하며 게시 후에는 기존 visibility를 읽기 전용으로 둔다.
- Alternatives Considered: 별도 설정 페이지, 새 Quote/승인 Node와 관리 목록, Profile 기본 정책을 추가하지 않는다.
- Consequences: 같은 actor Environment에서 Post를 갱신하고 기존 concrete global ID와 domain error를 재사용한다. 공개 범위 선택 직후 메뉴를 닫지 않아 인용 설정에도 접근할 수 있게 한다. 생성 입력·UI 확장은 PROD-924가 맡으며 PROD-431 tasks 2~3의 완료 조건을 확대하지 않는다.
- Confirmation / Follow-up: create·mutation·readback, selected Profile 변경, 권한 실패, 선택값 유지·오류 복구·접근성을 검증한다. 공개 schema·Relay·OpenSpec을 함께 갱신한다.

### D11 요청·승인 identity와 revision으로 재전달을 수렴

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, `memory/temporal-workflows.md`, PROD-924의 중복·동시·stale delivery 검증 책임.
- Status: Active
- Context / Problem: 중복 요청·지연된 승인과 commit 뒤 효과 전달 실패가 다른 승인 또는 새 Content를 만들 수 있다.
- Decision Outcome: 요청·승인·Quote·Source 결속과 조건부 revision을 확인한다. 확정 transition과 최소 전달 복구 정보를 같은 transaction에 남기고 현재 공통 Activity 설정의 최대 10회·시도당 1분을 사용한다. 재시도 소진은 승인·거절 상태와 분리한다.
- Alternatives Considered: 원격 시각에 따른 last-write-wins, retry마다 새 요청 ID, 장수명 승인 대기 Workflow와 명시적 비관적 DB 락은 사용하지 않는다.
- Consequences: 오래된 결과와 삭제된 Source/Quote를 복원하지 않는다. receipt는 해당 인용 효과 복구에만 사용하며 범용 ledger·exactly-once 보장으로 확장하지 않는다. 이미 queue에 들어간 메시지의 순서를 보장한다고 주장하지 않는다.
- Confirmation / Follow-up: commit/start gap, completion 유실, Worker restart, 승인 fetch와 철회 race, 대상별 실패와 stale queue delivery를 실행해 검증한다.

### D12 승인 요청 전용 표현과 본문 보존

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902·924의 별도 요청·승인 전 비노출·본문 보존 계약. 기술 근거: [FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/).
- Status: Active
- Context / Problem: 일반 pending Note가 Source를 숨기면서도 원문 서버에서는 QuoteRequest의 Source·Quote 결속을 검증해야 한다.
- Decision Outcome: 일반 Note와 요청 전용 instrument를 분리한다. 후보 Source 관계는 Source Author에게 보내는 요청에만 포함하고 일반 Note에는 노출하지 않는다. 승인 후 fallback은 발신 projection에만 추가하며 저장된 PostContent는 수정하지 않는다.
- Alternatives Considered: pending Note를 이미 승인된 Quote로 역참조하거나 본문에서 URL 문자열을 찾아 철회 때 삭제하는 방식은 사용하지 않는다.
- Consequences: 요청 표현에도 Quote 본문의 기존 접근 범위를 적용한다. 실제 helper·Mastodon/Hackers’ Pub fixture로 최소 instrument와 역참조를 검증한다. 권한을 넓혀 compatibility 실패를 우회하지 않는다.
- Confirmation / Follow-up: 일반 audience/Source Author/무권한 요청자의 표현, 동일 URL을 직접 쓴 본문, FEP와 invalid legacy 혼합, 철회 후 자동 표현 제거를 검증한다.

### D13 기존 Local Quote 0건 전제 폐기

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: 당시 PROD-924 Spec 대화의 데이터 전제. 2026-09-17 사용자 정정과 D15가 대체한다.
- Status: Superseded
- Context / Problem: 이전 초안은 기존 Local Quote가 없다고 잘못 전제했다.
- Decision Outcome: 이 전제와 이를 근거로 한 활성화 조건은 폐기한다. 기존 2건을 인지한 무백필·Source 표시 계약은 D15를 따른다.
- Alternatives Considered: 과거 전제를 현재 계약으로 유지하지 않는다.
- Consequences: 기존 Local Post 정책 초기화와 이미 발급된 승인 보존은 바꾸지 않는다.
- Confirmation / Follow-up: D15의 두 identity 확인, runtime 표시와 신규 Quote 격리 검증을 적용한다.

### D14 개별 승인 철회 도입 제외와 연합 lifecycle 유지

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, `docs/design/post-action-bar.md`, PROD-902·924의 2026-09-11 범위 정정; 현재 대화의 사용자 답변 “개별 승인 철회는 현재 도입하지 않음”.
- Status: Active
- Context / Problem: Mastodon의 인용별 철회 조작을 조사한 뒤 현재 출시에서의 제공 여부를 정해야 했다.
- Decision Outcome: 사용자용 개별 승인 철회 UI·API·권한 필드를 제공하지 않는다. 유효한 원격 `Delete(QuoteAuthorization)` 수신과 Local Source 삭제에 따른 승인 무효화·원격 전달은 유지한다. Quote 소유 서버는 기존 Quote audience에 검증된 철회를 전달하고 Source만 숨기며 자체 Content는 보존한다.
- Alternatives Considered: 상대 인용글 더보기의 확인 후 철회, 복구·재승인 UX는 현재 도입하지 않는다. 원격 철회 수신과 삭제 처리를 함께 제거하는 방안도 채택하지 않았다.
- Consequences: D4의 개별 철회 제공 범위를 대체한다. 정책 변경·차단은 기존 승인을 자동 철회하지 않으며 차단된 당사자의 Source 조회에는 기존 방향별 정책을 적용한다. PROD-924의 tasks 4~7은 연합 철회·삭제 검증을 유지한다.
- Confirmation / Follow-up: 원격 유효·위조 철회, Local Source 삭제, Quote audience 전달·재시도, 제3자 비노출과 자체 Content 보존을 실행해 검증한다.

### D15 기존 Local Quote 2건은 승인 backfill 없이 Source 표시 유지

- Decision Date: 2026-09-17
- Decision Class: Derived Contract
- Authority / Provenance: PROD-924 Spec 대화의 사용자 정정 “production에는 기존 Local Quote가 2건 존재”와 무백필 지시, Human Decision 답변 “기존 2건의 Source 표시 유지: 신규 승인으로 간주하지 않는 기존 데이터 예외를 명시한다.”; 정정된 PROD-924·PROD-902, `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`.
- Status: Active
- Context / Problem: 현재 main은 Source 관계와 일반 조회 권한으로 표시하며 승인 상태가 없다. 기존 계약은 발급된 승인 보존과 원격 pending을 정의하지만 승인 기록 없는 도입 전 두 Quote의 전환 결과는 정의하지 않았다. 무백필만 명시하면 승인 누락을 미승인으로 해석해 Source를 숨길 위험이 있었다.
- Decision Outcome: 기존 Local Quote 2건의 존재를 인지한 상태에서 새 승인 상태·QuoteAuthorization을 backfill하지 않는다. 확인된 두 Quote는 신규 승인으로 간주하지 않는 기존 데이터 예외로 Source 표시를 유지한다. 승인 lifecycle 미편입이라는 읽기 분류이며 `PENDING / APPROVED / REJECTED / REVOKED` 상태를 합성하거나 새 저장 enum을 추가하지 않는다.
- Alternatives Considered: 새 승인 기준으로 타인 Source를 숨기는 안을 제시했으나 사용자가 표시 유지를 선택했다. 승인 추정 backfill은 사용자 지시로 제외한다.
- Consequences: 일반 Source 조회·방향별 차단·삭제 제한과 자체 Content 보존은 유지한다. 정확한 두 identity만 예외로 식별하며 신규 Quote의 누락 승인이나 임의의 과거 Quote로 확대하지 않는다. 이 표시 예외는 FEP 승인·QuoteAuthorization 발급·승인된 자동 발신 표현의 근거가 아니다. PROD-431 완료 범위와 자기 인용 계약을 바꾸지 않는다.
- Confirmation / Follow-up: 활성화 전 두 identity·Source 결속과 구버전 writer를 확인하고 대상이 다르면 활성화를 보류한다. 두 Quote의 무백필·Source 표시, 조회 불가·삭제·차단 시 비노출, 신규 승인 누락 비노출과 호환 rollback을 검증한다. 이 답변은 D15의 권위이며 수정본 전체 Spec Gate 승인은 별도 대기다.

## Remaining Decisions

- 현재 범위의 미결정 제품 정책은 없다. 기존 두 Quote의 runtime 표시는 사용자 선택을 반영한 D15로 결정됐다.
- UI 진입점은 D10, 개별 승인 철회 제외는 D14를 따른다. 수정본 전체 Spec Gate는 승인 대기다.
- Fedify exact version은 PROD-792의 조건부 채택 방침에 따라 실제 compatibility 검증 후 기록한다. 설치 성공이나 이 spec의 작성 완료를 채택 증거로 사용하지 않는다.
- 정확한 두 Quote identity·Source 결속과 구버전 writer는 활성화 전 확인한다. 내부 테이블·파일명은 design의 기본안을 조정할 수 있지만 공개 API·권한·상태·복구 계약은 유지한다.

## Superseded Decisions

- D4는 2026-09-11 D14로 대체됐다. 사용자용 개별 승인 철회 도입을 제외하고 연합 철회·삭제 lifecycle은 유지한다.
- D13의 기존 Local Quote 0건 전제는 2026-09-17 사용자 정정으로 폐기됐고 D15의 기존 2건 무백필·Source 표시 예외가 대체한다.
- 작성 전의 ‘PROD-902는 OpenSpec 제외, PROD-924에서 스펙 작성’ 해석은 사용자 정정과 Linear 갱신으로 폐기했다. 현재 결정은 D6이며 당시 기록은 조사 record에 보존한다.
