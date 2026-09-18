## Context

이 기록은 검증된 Source 작성자 정보를 사용한 Followers Only 원문 조회와 기존 Quote resolution 연결을 다룬다. proposal·specs·design은 설명과 적용 범위를 제공하며, 아래 결정의 권위는 독립적으로 확인한 canonical 문서와 최신 Linear 계약에 있다. 2026-09-08 사용자의 작성자 신뢰 경계 확정은 해당 upstream 문서에 먼저 반영했다.

## Decision Records

### D1. 검증된 Source URI와 작성자 대응만 사용한다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「Source 작성자 신뢰 경계 확정」; [PROD-792](https://linear.app/byulmaru/issue/PROD-792) 「공통 Note 처리와 목록 기능의 책임」.
- Status: Active
- Context / Problem: Source URI만으로는 서명할 Follower를 고르는 데 필요한 작성자를 신뢰할 수 없다.
- Decision Outcome: 인증된 선행 처리에서 검증한 Source URI↔작성자 대응과 저장된 Remote Actor가 있을 때만 실행한다. URI-only, 미저장·불명확한 작성자는 건너뛴다.
- Alternatives Considered: Quote 작성자·delivery actor·host에서 작성자를 추론하는 방식은 대응 검증을 대체하지 못한다. URI-only 탐색을 포함하는 안은 사용자가 이번 범위에서 제외했다.
- Consequences: PROD-792에서 검증된 입력을 전달하는 production 연결이 필요하다. 해당 연결 없이 테스트 fixture만 성공해도 완료로 판단할 수 없다.
- Confirmation / Follow-up: 2026-09-08 이 작업에서 사용자가 「권장안으로 확정」이라고 답했다. PROD-793과 PROD-792 본문 및 canonical Post 문서에 반영했다. 실제 입력 공급 경로는 구현 전에 확인한다.

### D2. 자격이 있는 Local Follower의 같은 identity로 조회하고 재검증한다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」; `docs/domain/objects/follow-relationship.md` 「조회 정책」; `docs/domain/objects/profile.md` 「상태」; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「실행 자격」·「인증된 원문 조회」·「저장 직전 재검증」; [PROD-360](https://linear.app/byulmaru/issue/PROD-360).
- Status: Active
- Context / Problem: 임의의 signer를 사용하거나 fetch 이전의 Follow 상태만 확인해서는 Source별 조회 자격을 보장할 수 없다.
- Decision Outcome: 기존 local 수신 자격을 만족하는 Active Local established Follower 하나를 결정적으로 선택한다. 해당 identity의 Fedify authenticated document loader를 사용하고 같은 조회 시도의 저장 직전에도 그 Profile과 Follow를 검사한다.
- Alternatives Considered: 서버 공용 identity, unsigned fetch와 다른 Follower 권한으로 응답을 저장하는 방식은 현재 계약에 맞지 않는다. 후보 total order의 구체적인 구현은 design의 비규범적 지침으로 남긴다.
- Consequences: 같은 후보 집합의 선택 결과가 일정해야 하며 Profile 비활성화·Follow 해제 후 저장을 거부해야 한다.
- Confirmation / Follow-up: 서명 identity 관찰, 후보 순서 변경, 조회 도중 자격 변경을 실행하는 테스트로 검증한다.

### D3. 검증된 Followers Only Source에만 private admission을 적용한다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」·ActivityPub audience 분류; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「기존 기반 재사용과 추가 책임」·「저장 직전 재검증」; [PROD-509](https://linear.app/byulmaru/issue/PROD-509) 「포함 범위」·「완료 기준」; 2026-09-09 사용자 확정.
- Status: Active
- Context / Problem: 공용 projection과 저장을 재사용한다는 이유로 일반 materializer의 private 허용 범위를 넓힐 수 있다.
- Decision Outcome: typed Note·exact target ID·예상 작성자·canonical Followers Only audience·같은 Follower 자격을 모두 검증한 경우만 private Source를 저장한다. 검증·저장 실패 시 partial Source 및 Quote 관련 상태를 남기지 않는다.
- Alternatives Considered: 공개 callback·evaluator나 일반 private 허용 flag에 검증 책임을 맡기는 방식은 PROD-509의 검증 우회 금지와 맞지 않는다. 별도 Note 변환·저장 엔진도 만들지 않는다.
- Consequences: 기존 Create의 Followers Only 수신은 유지하고, PROD-509의 일반 신규 조회는 기존 Public/Unlisted 범위를 유지한다. Source/Content/Media/mapping의 원자성을 행동으로 검증한다.
- Confirmation / Follow-up: identity·author·audience 실패, 정상 extra addressee, transaction rollback 및 일반 materializer의 private 거부를 검증한다. 2026-09-10 PROD-509의 확정된 독립 저장 경계를 대조했다. 이 경로는 기존 작성자를 사용하며 Post 실패를 이유로 작성자·Instance를 보상 삭제하지 않는다.

### D4. 기존 Quote revision과 승인 상태를 보존한다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md` 「관계」·「미저장 Followers Only Quote Source 조회」; `docs/domain/decisions/0014-post-structure-relations.md`; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「Quote resolution 연결」; [PROD-792](https://linear.app/byulmaru/issue/PROD-792) 「저장과 조회」·「Quote resolution Workflow」.
- Status: Active
- Context / Problem: 늦게 도착한 fetch 결과나 중복 실행이 현재 Quote target·승인 상태를 바꾸면 잘못된 Source를 노출할 수 있다.
- Decision Outcome: `Posts.repostSourceId`와 PROD-792의 revision별 resolution에 연결한다. `activitypubQuoteResolutionWorkflow`, `activitypub-quote-resolution:{postId}:{revision}` 및 transient 오류만 최대 10회 재시도하는 계약을 유지한다. stale·영구 검증 실패는 멱등 no-op으로 처리한다.
- Alternatives Considered: 별도 Quote Source 관계, 별도 독립 retry Workflow, Source 저장만으로 승인 처리하는 방식은 기존 계약에 맞지 않는다.
- Consequences: URI별 Source uniqueness와 현재 revision의 일관된 Quote 상태를 유지한다. 선행 Workflow 구현이 없으면 이 연결을 완료로 선언할 수 없다.
- Confirmation / Follow-up: target/revision 변경, duplicate/concurrent 실행, transient 오류 후 성공·소진과 영구 검증 실패를 확인한다.

### D5. Fetch에 사용한 Follower의 권한을 viewer에게 이전하지 않는다

- Decision Date: 2026-09-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md` 「Post Visibility」·「Post Eligibility」·「미저장 Followers Only Quote Source 조회」; `docs/design/post-action-bar.md`; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「Quote resolution 연결」·「검증」; [PROD-792](https://linear.app/byulmaru/issue/PROD-792) 「저장과 조회」.
- Status: Active
- Context / Problem: 원문을 저장할 수 있다는 사실과 현재 viewer가 그 원문을 볼 수 있다는 사실은 별개다.
- Decision Outcome: 기존 Quote 승인과 현재 viewer의 Source 조회 정책을 모두 통과할 때만 Source를 반환한다. Source가 숨겨져도 조회 가능한 outer Quote 본문은 유지한다.
- Alternatives Considered: materialization 성공을 viewer access로 간주하거나 UI에서만 Source를 숨기는 방식은 허용하지 않는다.
- Consequences: 새 GraphQL 타입·화면 없이 기존 resolver와 Quote 카드를 재사용한다. fetch 이후 Follow 해제도 이후 조회에 반영한다.
- Confirmation / Follow-up: 승인·미승인·철회와 authorized/unauthorized viewer를 조합하여 GraphQL 결과와 기존 목록·상세 표시를 확인한다.

### D6. Reply Source를 Parent와 독립적으로 처리한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md` 「원격 Note의 최초 materialization과 Reply Parent」; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「Reply Source와 재사용 경계 정렬」; [PROD-509](https://linear.app/byulmaru/issue/PROD-509) 「Reply 최초 저장 계약」.
- Status: Active
- Context / Problem: Reply Source의 작성자나 audience를 Parent에서 가져오면 다른 원문의 권한으로 private 조회를 허용할 수 있다.
- Decision Outcome: Source 자체의 identity·expected author·audience와 Follower 권한을 검증한다. Parent는 기존 DB lookup과 허용된 null fallback만 적용하며 DB 장애를 fallback으로 바꾸지 않는다.
- Alternatives Considered: Parent로 Source를 대체하거나 Parent를 원격 조회·재귀 materialize하는 방식은 확정된 범위에 맞지 않는다.
- Consequences: Parent 유무와 작성자·audience 차이를 회귀 검증한다. 후속 Parent update/backfill은 PROD-506 범위이며 이 change의 blocker가 아니다.
- Confirmation / Follow-up: 2026-09-09 확정된 Linear 계약을 2026-09-10 다시 대조했다. PROD-661은 PROD-509에 흡수되어 Canceled이며 별도 projector 선행 조건을 두지 않는다.

## Remaining Decisions

- 추가 제품 결정은 없다. `Blocked` 상태의 결정도 없다. Source URI-only 탐색은 확정된 제외 범위이며 구현 task로 만들지 않는다.
- 선행 구현에서 확인할 사실은 남아 있다. 검증된 Source 작성자 입력 공급 경로, transaction 참여 API와 Workflow rollout 호환성을 확인한 뒤 구현한다. 계약을 바꾸는 선택이 필요해지면 upstream을 먼저 갱신하고 승인받는다.
- 별도 `Implementation Choice`를 고정하지 않았다. 후보 정렬, 함수·파일 배치와 transaction 연결 수단은 기존 계약을 만족하는 범위에서 선택한다.

## Superseded Decisions

- 없음.
