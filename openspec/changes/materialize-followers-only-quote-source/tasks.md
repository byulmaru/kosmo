## 1. PROD-793 검증된 Source 입력과 Local Follower 선택

**Authority / Provenance**

- `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」, `docs/domain/objects/follow-relationship.md` 「조회 정책」, `docs/domain/objects/profile.md` 「상태」.
- [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「Source 작성자 신뢰 경계 확정」·「실행 자격」·「OpenSpec 소유권과 완료 경계」; [PROD-792](https://linear.app/byulmaru/issue/PROD-792) 검증된 Source 입력 전달 연결; [PROD-360](https://linear.app/byulmaru/issue/PROD-360).

**Deliverable**

production 경로에서 현재 Quote target에 대응하는 검증된 Source 작성자 정보를 받아, 자격이 있는 Active Local Follower 하나만 결정적으로 선택한다. 이 그룹의 소유자는 PROD-793이다.

**Guardrails**

- 구현 착수 전에 Spec 승인, main에 병합된 PROD-509와 PROD-792의 전달 가능한 최종 구현을 확인한다. 로컬 복구본의 통과 결과만으로 production 공급 경로나 dependency delivery gate가 완료됐다고 간주하지 않고, 선행 구현을 이 이슈의 task로 다시 만들지 않는다.
- URI-only, 미저장 작성자, 검증되지 않은 attribution은 fetch 이전에 거부한다. 검증된 입력 공급 지점이 없으면 연결을 완료로 처리하지 않는다.
- 같은 후보 집합은 같은 identity로 수렴하고 Pending·rejected·removed 관계 및 부적합 Profile·Instance는 후보가 아니다.

**Verification**

- 실제 Quote resolution 진입에서 검증된 Source URI↔작성자 정보가 전달되는 흐름을 실행한다. `postId + revision`만 받는 Workflow 또는 임의 expected author를 주입하는 fixture만으로 통합 완료를 대신하지 않는다.
- 검증 정보 누락·다른 target·미저장 작성자·후보 없음에서 네트워크 요청과 Source 저장이 없음을 확인한다.
- 후보 입력 순서와 반복 실행을 바꿔 선택 identity가 같은지 검증하고, 비활성 Profile·Instance 및 Request-only 후보를 배제한다.

- [ ] 1.1 선행 구현과 검증된 Source 작성자 정보의 production 공급 경로를 확인하고, 현재 Quote target·revision에 맞는 전달 연결을 구현한다.
- [x] 1.2 적합한 Local Follower의 결정적 선택과 부적합 입력·후보의 무요청 종료를 구현한다.
- [ ] 1.3 검증된 입력 전달, 후보 결정성, URI-only·미저장 작성자·권한 없는 후보의 행동 검증을 추가한다.

## 2. PROD-793 Source별 인증 조회와 저장 직전 재검증

**Authority / Provenance**

- `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」·ActivityPub audience 분류, `docs/domain/objects/follow-relationship.md`.
- [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「인증된 원문 조회」·「저장 직전 재검증」; [PROD-509](https://linear.app/byulmaru/issue/PROD-509) typed Note·exact identity·기존 document loader 계약.

**Deliverable**

1번 그룹에서 선택한 identity의 서명으로 원문을 조회하고, 저장 직전에 Note identity·author·audience 및 같은 Follower 자격을 다시 검증한다. 소유자는 PROD-793이다.

**Guardrails**

- 임의 Profile·공용 identity·unsigned fetch로 대체하지 않는다. 기존 Fedify loader와 vocabulary를 재사용한다. main의 Profile별 actor lookup loader 전달 패턴은 참고할 수 있지만 Source signer 자격과 key 존재 검증을 생략하지 않는다.
- Source ID는 요청한 Quote target URI와 정확히 일치해야 하고, Source 작성자 identity는 전달받은 expected author identity와 정확히 일치해야 한다. Public/Unlisted·Direct는 이 private admission을 통과하지 못한다.
- 재검증 실패 시 Source·Content·Media·mapping·Quote 연결과 상태를 변경하지 않는다. 다른 Follower의 권한으로 응답을 저장하지 않는다.

**Verification**

- 실제 요청의 signature/key identity가 선택한 Profile을 가리키는지 검증한다. 서명 key 부재 시 일반 loader로 Source 요청을 보내지 않는지도 확인한다.
- non-Note, ID 불일치, author 불일치·누락·복수, canonical followers marker 누락과 Public/Unlisted·Direct를 입력해 저장이 없음을 검증한다.
- canonical marker와 추가 유효 addressee가 있는 정상 Note는 기존 audience 분류를 유지하는지 확인한다.
- fetch를 제어 가능한 시점에 대기시키고 Profile 비활성화·Instance 자격 상실·Follow 해제를 적용한 뒤 응답을 전달해 Source 및 Quote 관련 상태가 바뀌지 않는지 확인한다.

- [x] 2.1 선택한 identity의 authenticated fetch와 signer 부재 시 무요청 종료를 구현한다.
- [x] 2.2 typed Note·exact identity·attribution·audience 및 동일 Profile·Follow의 저장 직전 재검증을 구현한다.
- [x] 2.3 실제 서명 identity, 검증 실패, 정상 extra addressee와 fetch 도중 권한 변경의 행동 검증을 추가한다.

## 3. PROD-793 원자적 Source 저장과 Quote revision 수렴

**Authority / Provenance**

- `docs/domain/objects/post.md` 「관계」·「미저장 Followers Only Quote Source 조회」, `docs/domain/decisions/0014-post-structure-relations.md`.
- [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「기존 기반 재사용과 추가 책임」·「Quote resolution 연결」; [PROD-509](https://linear.app/byulmaru/issue/PROD-509) 원자성·중복 처리; 기존 production helper 재사용; [PROD-792](https://linear.app/byulmaru/issue/PROD-792) resolution·retry·stale 계약.

**Deliverable**

2번 그룹의 검증을 통과한 Source가 URI마다 하나로 저장되고, 현재 Quote revision의 Source 관계에 멱등하게 연결된다. 소유자는 PROD-793이다.

**Guardrails**

- PROD-509 PR #826의 공개 `materializeHydratedRemoteNote`는 Public/Unlisted만 허용한다. 내부 저장 helper에서 필요한 최소 경계를 재사용하되 private 검증과 Quote revision 연결의 transaction 참여를 직접 확인한다.
- 기존 production helper·PROD-509 materializer·Post 저장을 재사용한다. PROD-509의 일반 신규 조회에 private admission을 일괄 허용하지 않는다.
- 기존 `Posts.repostSourceId`, Quote resolution Workflow identity와 transient 오류만 최대 10회 재시도하는 정책을 유지한다.
- stale revision은 현재 Quote를 덮어쓰지 않는다. Source 저장은 승인 상태를 바꾸는 근거가 아니다.
- 실패한 저장은 partial Source 관련 상태를 남기지 않고 중복·동시 실행은 URI uniqueness를 보존한다.

**Verification**

- 실제 DB에서 정상 Source·PostContent·Media·mapping의 일관성, transaction 실패의 rollback, 동일 URI의 동시 저장 수렴을 확인한다. 선택된 Media 검증 실패의 전체 거부와 기존 작성자·Instance 보존을 확인한다. PROD-465의 10,000자 수신 한계를 Source 자체에 적용하고 Local Quote 작성분과 합산하지 않는다.
- fetch 중 Quote target/revision을 바꿔 늦은 응답이 현재 Quote를 덮어쓰지 않는지 검증한다.
- production Activity 등록을 사용하는 Workflow 검증으로 transient 후 성공·재시도 소진·영구 검증 실패·duplicate/concurrent 실행을 확인한다.
- 기존 Create Followers Only 수신, 일반 materializer의 private 거부, PROD-792 Public/Unlisted 조회와 저장된 Source 연결을 회귀 검증한다.

- [x] 3.1 검증된 Source의 private admission을 공용 materializer에 연결하고 기존 저장 원자성을 유지한다.
- [x] 3.2 Source 저장 결과를 현재 Quote revision에 멱등하게 연결하고 기존 retry·stale·승인 상태 정책을 보존한다.
- [x] 3.3 rollback·동시 저장·stale revision·transient 재시도·영구 실패 및 기존 수신/조회 경로의 행동 검증을 추가한다.

## 4. PROD-793 기존 viewer 접근과 Quote 표시 검증

**Authority / Provenance**

- `docs/domain/objects/post.md` 「Post Visibility」·「Post Eligibility」·「미저장 Followers Only Quote Source 조회」, `docs/design/post-action-bar.md` 기존 Quote Source 표시·탐색 계약.
- [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「Quote resolution 연결」·「검증」; [PROD-792](https://linear.app/byulmaru/issue/PROD-792) 「기존 조회·표시 경로 재사용」·「저장과 조회」.

**Deliverable**

3번 그룹에서 저장한 Source가 승인 및 현재 viewer 권한에 따라 기존 목록·상세 카드에 표시되고, 권한 없는 viewer에게는 outer Quote 본문만 남는다. 소유자는 PROD-793이다.

**Guardrails**

- fetch signer의 권한을 viewer에게 이전하지 않는다. 기존 GraphQL Source 조회 단계부터 정책을 적용한다.
- 새 GraphQL 타입·프론트 화면을 만들지 않고 Quote 승인·철회 정책을 재정의하지 않는다.

**Verification**

- 승인된 Quote의 authorized viewer와 unauthorized viewer·guest를 비교해 Source 반환과 outer 본문 보존을 확인한다. viewer 조건은 기존 정책을 따른다.
- 미승인·철회 및 materialization 이후 viewer Follow 해제에서 Source가 숨겨지는지 확인한다. Block Owner 단방향·Block Target·양방향을 나눠 최신 Post Eligibility를 확인한다.
- 기존 Quote 목록·상세 presentation의 표시 결과와 navigation을 확인하고 일반 Post·Reply·Repost·기존 Local Quote가 영향을 받지 않는지 검증한다.

- [ ] 4.1 기존 GraphQL Source·Quote 표시 경로에 이번 materialization 결과를 연결하고 viewer별 노출을 확인한다.
- [ ] 4.2 승인·권한·Follow 변경 조합의 GraphQL 및 기존 목록·상세 표시 검증을 추가한다.

- [ ] 4.3 Reply Source와 Parent의 작성자·audience가 다른 경우에도 Source 자체의 identity·expected author·private admission을 검증하고 Parent로 대체하지 않는지 확인한다. Parent 저장 여부·허용된 null fallback·DB 장애 전파·Parent 추가 fetch 없음도 검증한다. 이 검증과 기존 signed-fetch 통합·delta 동기화·archive는 PROD-793이 소유한다.

## 5. PROD-793 통합 검증과 change 완료 책임

**Authority / Provenance**

- `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」, `docs/domain/objects/follow-relationship.md`, `docs/design/post-action-bar.md`.
- [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「검증」·「OpenSpec 소유권과 완료 경계」.
- 저장소 완료 정책: `AGENTS.md`, `memory/issue-openspec-workflow.md`, `memory/coding-style.md`, `memory/temporal-workflows.md`.

**Deliverable**

1~4번 전체의 production 연결과 검증 결과를 PROD-793 담당자가 통합 확인한다. 같은 담당자가 전체 change의 완료 증거, delta spec 동기화와 archive를 소유한다.

**Guardrails**

- 선행 이슈/PR 순서나 상태만으로 integration·archive 책임 또는 완료를 추론하지 않는다.
- 구현을 실행하지 않는 소스 문자열 검사를 행동 검증의 대용으로 추가하지 않는다.
- Spec 단계에는 이 task를 완료 표시하지 않는다. 해당 PR의 Ready 전환과 전체 OpenSpec archive는 별개다.

**Verification**

- 검증된 입력 공급 → 선택 identity의 signed fetch → 저장 직전 재검증 → Source 저장 → 현재 revision 연결 → viewer별 기존 카드 결과를 하나의 통합 흐름으로 확인한다.
- 변경 package의 타입 검사·행동 테스트와 Worker build로 production Activity wiring을 확인한다. 실제 실행 가능한 명령은 구현 시 최신 `package.json`과 workspace scripts에서 확인한다.
- canonical·최신 Linear·OpenSpec의 독립 대조, `openspec validate materialize-followers-only-quote-source --strict`, 관련 formatting·문서 검증을 수행한다.
- 런타임·배포 검증을 수행하지 못한 부분은 명시하며, 필요한 검증이 남으면 완료로 처리하지 않는다.

- [ ] 5.1 PROD-793이 소유한 전체 흐름의 통합 검증과 영향 package·Worker 검증 결과를 남긴다.
- [ ] 5.2 최신 upstream과 실제 구현에 OpenSpec을 정렬하고 required validation 및 rollout·rollback 근거를 확인한다.
- [ ] 5.3 전체 declared scope와 모든 task가 완료되었을 때 PROD-793 담당자가 delta spec을 동기화하고 change를 archive한다.
