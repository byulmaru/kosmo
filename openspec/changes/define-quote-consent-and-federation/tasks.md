## 1. PROD-924 게시글별 정책과 초기값

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`,
  `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

**Deliverable**

기존 공개 범위 설정 UI에 새 인용 허용 정책 선택 UI를 추가해 새 글과 함께 저장할 수 있다. 게시 후에도 게시글별로 정책을 조회·변경하고 요청에 적용할 수 있다. 구체적인 GraphQL
field·mutation·payload와 오류는 이번 `quote-consent`의 공개 API 계약을 따르며 같은 Post를 갱신한다.

**Guardrails**

- 모두·팔로워·본인만, 입력 생략·null의 기본값 모두와 기존 승인 비소급을 유지한다.
- 기존 공개 범위 UI의 Public·Unlisted에서만 인용 설정을 표시한다. Profile 기본값·본문/visibility 편집·사용자용 개별 철회는 추가하지 않는다.
- Local Note `canQuote.automaticApproval`은 모두=Public, 팔로워=followers collection+Author Actor,
  본인만=Author Actor로 표현하고 `manualApproval`은 제공하지 않는다.
- Active Account와 Post Author 권한을 확인한다. Profile 기본값·건별 수동 승인 UI는 포함하지 않는다.
- PROD-924가 정책 저장, 기존 Local Post 초기화, 기존 승인 보존과 rollback 접근 보호를 함께 소유한다.

**Verification**

- 새/기존 Post 초기값, 정책 변경 권한과 selected Profile 격리, 기존 승인 보존을 검증한다.
- 세 정책의 최초 Local Note projection, 정책 변경 뒤 같은 identity Update와 manual 대상 비포함을 payload로 검증한다.
- 기존 Local Quote 2건의 승인 상태·QuoteAuthorization 무백필, 기존 Source 표시, 조회 불가·삭제·방향별 차단 시 비노출과 본문 보존을 실행해 검증한다. 신규 Quote의 승인 누락은 예외로 처리하지 않는다.
- 실제 schema diff와 migration/backfill, rollback 후 Source 접근 보호, 확정한 GraphQL 계약을 구현 PR에 기록한다.

- [ ] 1.1 새 글과 기존 글의 정책 조회·초기화 및 정책 변경을 연결하고 optional `CreatePostInput.quotePolicy`를 작성 transaction에 저장한다.
- [ ] 1.2 기존 공개 범위 설정 UI의 Public·Unlisted에 새 인용 허용 정책 선택 UI를 추가하고 게시 후 본인 글의 인용 설정에도 재사용한다. draft 수명·중복 제출 방지·오류 복구를 연결한다.
- [ ] 1.3 초기값·권한·변경 비소급·기존 데이터 보존을 검증한다.
- [ ] 1.4 정책 저장을 additive로 도입하고 기존 Local Post의 `모두` 초기화·재실행·이미 지정한 정책 보존을 검증한다. 기존 Local Quote 2건의 새 승인 상태·QuoteAuthorization은 backfill하지 않는다. 정확한 두 identity·Source 결속과 구버전 writer를 확인하고 D15의 기존 Source 표시 예외와 신규 Quote의 승인 guard를 함께 검증한다.
- [ ] 1.5 정책 enum·mutation·payload·권한 필드를 실제 API 요청과 readback으로 검증하고 SDL·Relay를 동기화한다.
- [ ] 1.6 세 정책의 최초 Note·동일 identity Update와 기존 승인 비소급을 실제 serialized payload·DB 상태로 검증한다.

- [ ] 1.7 정책 선택·공개 범위 전환·create payload·게시 후 저장·오류 복구·actor 격리·Web keyboard/focus를 실행해 검증한다. Native Modal 검증 여부를 구분한다.

## 2. PROD-431 기본 Quote 작성 API와 core

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`,
  `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-431·902의 2026-09-09 정정, PROD-924.

**Deliverable**

인용 조건을 통과한 Local Source와 자체 Content로 기본 Quote를 원자적으로 작성하고 기존 Post payload로 조회한다.

**Guardrails**

- 이 task의 완료는 1번과 PROD-924의 federation lifecycle 완료를 선행 조건으로 두지 않는다.
- 작성 시점에 충분히 검증할 수 있는 Source만 연결한다. FEP-044f 승인이 필요한 ActivityPub Source는 승인 경계가
  연결되기 전까지 안전하게 거부하며 Source FK만으로 승인 여부를 판단하지 않는다.
- 현재 지원하는 Local Source에서 타인은 Public·Unlisted만 허용하고, 자기 Followers Only는 원문 접근 유지 조건을 따른다.
  Remote Source eligibility와 `interactionPolicy` 판정은 PROD-924가 승인 lifecycle과 함께 연결한다.
- Reply+Quote 작성은 제공하지 않는다. 기존 Post·Reply 입력과 저장 관계·원격 수신·조회는 보존한다.
- 실패한 작성에서 부분 결과와 권한 없는 Source 정보가 남지 않게 한다.
- Quote 전용 Node·Kind를 추가하거나 정책·승인 lifecycle을 두 번째 모델로 재구현하지 않는다.

**Verification**

- core DB test로 Source Content·조회·삭제·차단·공개 범위와 Media metadata rollback을 확인한다.
- 실제 mutation으로 작성한 Post를 다시 조회한다. fixture 직접 삽입만으로 작성 성공을 증명하지 않는다.
- global ID type·인증·selected Profile, Source 생략·null, Source/Parent 동시 입력 거부, 기존 Post·Reply 회귀를 확인한다.
- Media-only·Content Warning·Sensitive Media·독립 Visibility와 commit 뒤 effect 실패의 게시 결과 보존을 확인한다.
- ActivityPub Source는 승인 저장 구현 없이 정상 Source로 노출되지 않고 명시적으로 거부되는지 확인한다.

- [x] 2.1 기존 작성 입력에 Source를 연결하고 기본 Quote와 기존 Post·Reply의 입력 범위를 구분한다.
- [x] 2.2 Local Source 조건·접근·차단을 검증하고 Content·인용 대상 정보·Media의 원자적 작성을 연결한다.
- [x] 2.3 승인 lifecycle이 없는 ActivityPub Source 작성을 안전하게 거부하고 클라이언트가 Source를 낙관 표시하지 않는 seam을 고정한다.
- [x] 2.4 core/API의 거부·rollback·readback·입력 호환과 기존 작성 효과 회귀를 검증한다.

## 3. PROD-431 Composer와 기본 Post 조회

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `docs/design/reply-composer.md`,
  `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-431·902의 2026-09-09 정정, PROD-924.

**Deliverable**

인용 메뉴에서 기본 Quote를 작성하고, 서버가 반환한 Source를 viewer 접근 조건에 맞게 표시한다.

**Guardrails**

- 2번 작성 결과와 기존 Post 조회 계약을 사용하며 PROD-924 완료를 선행 조건으로 두지 않는다.
- 기본 Quote는 Source만 받는다. 링크 인용과 Reply+Quote 진입·API·성공 검증을 추가하지 않는다.
- 기존 메뉴·Composer·direct preview·입력 검증·폐기 보호와 selected Profile별 Environment를 재사용한다.
- 클라이언트는 서버 payload에 없는 Source를 낙관적으로 만들지 않는다. ActivityPub 승인 대기·거절·철회
  상태를 생성하고 갱신하는 lifecycle은 PROD-924가 이 seam에 연결한다.
- Quote 성공을 Source Repost count·선택 상태로 표현하지 않는다. 없는 connection이나 다른 actor Store를 갱신하지 않는다.

**Verification**

- 실제 Relay operation 기반 Storybook에서 메뉴·preview·취소·제출·pending·실패·재시도와 Media/CW 가림을 확인한다.
- 성공·부분 오류·Post 없는 실패, connection 미로드·중복 완료·actor/Environment 전환·unmount 뒤 늦은 응답을 확인한다.
- Source 삭제·차단·viewer 접근의 Post readback과 Source null·카드 상태를 확인한다.
- Web 실제 Quote 작성 E2E와 keyboard/focus/dismiss/accessibility를 확인한다. Native runtime은 별도 release gate다.
- PROD-431은 작성 cross-layer 증거를 제공하고 PROD-924는 이를 실제 연합 lifecycle과 연결해 전체 change를 검증한다.

- [x] 3.1 인용 메뉴와 direct Source를 가진 공용 Composer의 기본 작성·취소·제출·오류 복구를 연결한다.
- [x] 3.2 viewer 접근을 Source 조회에 적용하고 같은 Post identity의 본문·Source 표시를 검증한다.
- [x] 3.3 요청 actor의 작성 성공 cache와 늦은 응답 격리·기존 presentation 회귀를 검증한다.
- [x] 3.4 Web 작성 E2E·접근성 증거와 API 선배포·접근 보호 rollback 및 Native 미검증 범위를 기록한다.

### PROD-431 완료 게이트

2~3번 task와 PROD-431이 담당하는 API/core/client cross-layer 및 기존 Post·Reply·Repost 회귀 검증이
통과하면 PROD-431과 PR #817은 완료할 수 있다. 1번과 4~7번의 미완료, 즉 PROD-924의 정책·federation
lifecycle·전체 change archive는 PROD-431의 Draft 또는 완료 blocker가 아니다.

## 4. PROD-924 Kosmo 원문의 자동 승인과 삭제 시 승인 정리

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`, `docs/design/post-action-bar.md`,
  `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

**Deliverable**

Kosmo 원문이 요청을 정책대로 자동 승인·거절하고 Source 삭제 시 발급한 승인을 무효화해 원격에 전달한다.

**Guardrails**

- 1번 정책과 기존 Follow·Block·조회 경계를 사용한다.
- 요청 Profile·Quote·Source·승인 발급자 대응을 검증한다. 정책 변경·차단은 기존 승인을 자동 철회하지 않는다.
- QuoteAuthorization dispatcher는 Source 조회 권한을 적용하고 `interactingObject`를 embed하지 않는다.
  요청자의 Source 조회 권한이 없거나 이를 확인할 수 없으면 승인 객체 자체를 제공하지 않는다.
- 사용자용 개별 승인 철회 UI·API는 제공하지 않는다. Source 삭제는 Source만 숨기고 Quote 자체 본문을 보존한다. 철회 `Delete`의 `object`와 `target`에는
  객체를 embed하지 않고 URI 참조만 제공한다.

**Verification**

- 정상·위조·차단·정책상 거부 요청, 중복 승인, Source 삭제 후 승인 무효화, 제3자 비노출과 본문 보존을 검증한다.
- 권한별 QuoteAuthorization dispatcher/readback, 무권한·권한 미확인 응답의 승인 객체 비제공과
  `interactingObject` embed 제한을 검증한다.
- Source 삭제에 따른 승인 철회 `Delete`의 `object`·`target` URI 참조와 객체 비포함을 payload로 검증한다.

- [ ] 4.1 Kosmo 원문 QuoteRequest의 검증·자동 Accept/Reject·승인 발급과 권한 기반 QuoteAuthorization dispatcher를 연결한다.
- [ ] 4.2 기존 Local Source 삭제에 발급 승인 무효화와 객체를 embed하지 않는 원격 철회 전달을 연결한다. 삭제·전달 재시도에도 자체 Content를 보존하고 승인을 되살리지 않는다.
- [ ] 4.3 팔로워 정책에서 무관계·pending Follow Request 요청은 Reject하고 established Follower·Source Author 요청은 Accept하는지,
      각 결과의 승인 발급·Source 노출 post-state와 중복 요청, 승인 객체 readback·무권한 비제공 및
      차단/Source 삭제의 다른 결과를 검증한다.

- [ ] 4.4 원격 Quote가 아직 materialize되지 않은 유효한 요청의 identity 결속·승인 발급·역참조를 검증하고 PROD-792의 수신 상태와 중복 소유하지 않는다.
- [ ] 4.5 같은 승인 URI의 valid/forged Delete, 무권한 역참조와 requester별 Source 접근을 검증한다.

## 5. PROD-924 로컬 Quote 발신과 원격 승인 결과

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`,
  `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

**Deliverable**

자기 인용은 요청 없이 허용하고, 원격 타인 원문은 `interactionPolicy`와 관계없이 본문을 먼저 전달한 뒤
QuoteRequest와 유효한 QuoteAuthorization을 통해 같은 Quote의 Source 표현을 수렴시킨다.

**Guardrails**

- 2번 작성 결과와 기존 canonical identity·audience·공통 delivery를 사용한다.
- automatic/manual 광고와 정책 부재·해석 실패 모두 별도 QuoteRequest를 보내고, 유효한 Accept·승인 후 Update를 지킨다.
- `interactionPolicy`는 UI·예상 eligibility의 힌트일 뿐 승인 증거가 아니다. 승인 전 Source와 자동 생성 호환 표현을 숨긴다.
- 유효한 원격 철회를 수신하면 Source를 숨기고 기존 Quote audience에 `Delete(QuoteAuthorization)`을 전달한다.
  전달하는 `Delete`의 `object`와 `target`에는 객체를 embed하지 않고 URI 참조만 제공한다.
- Local Source 삭제는 그 Source의 유효한 승인을 열거해 결속된 Quote Author 또는 Quote 소유 서버 inbox에
  `Delete(QuoteAuthorization)`을 전달하고, 소유 서버의 Quote audience forwarding으로 수렴시킨다.
- 원격 Quote 수신 PROD-792를 중복 구현하거나 일반 사용자용 본문 수정을 추가하지 않는다.

**Verification**

- local/remote Source, 자기 인용, automatic/manual, 정책 부재·해석 실패, 어느 집합에도 포함되지 않는 경우,
  valid/invalid Accept, Reject, source delete와 동일 identity Update를 확인한다. 발신 payload와 최종 Source 조회를 함께 검증한다.
- 유효·위조 철회 수신, `object`·`target`을 embed하지 않는 기존 Quote audience forwarding과 대상별 전달 실패
  뒤의 상태 보존을 검증한다.
- Local Source 삭제에서 일반 `Delete(Note)` audience 밖의 Quote Author/소유 서버도 승인 철회를 받고,
  Quote audience까지 Source 비노출로 수렴하는 recipient 경로를 검증한다.

- [ ] 5.1 승인된 Quote projection과 pending 본문 선발신·원격 요청을 연결한다.
- [ ] 5.2 로컬 Quote의 원격 Accept/Reject·승인 철회를 검증해 Source·필요한 Update와 객체를 embed하지 않는 기존 Quote audience 철회 전달을 연결한다.
- [ ] 5.3 일반 Post·Reply·Repost identity/audience 회귀와 승인 전 Source 비노출을 검증한다.
- [ ] 5.4 자기 인용의 요청 생략과 원격 타인 원문의 정책별 QuoteRequest·pending·승인 증거 경계를 검증한다.

- [ ] 5.5 PROD-431의 Remote Source 거부와 승인 미구현에 따른 eligibility 제한을 실제 pending 작성 경로에 연결하고 본문·Source FK·승인 결속의 transaction rollback 및 성공 readback을 검증한다.
- [ ] 5.6 일반 Note와 요청 전용 instrument·역참조를 분리하고 Quote 본문 audience가 Source Author를 포함하는 경우와 포함하지 않는 경우의 접근 보존을 검증한다.
- [ ] 5.7 Local Source 삭제가 일반 Delete audience 밖의 Quote Author까지 승인 철회를 전달하고 Quote audience에서 본문만 남는지 검증한다.

## 6. PROD-924 레거시 발신과 재전달 수렴

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

**Deliverable**

승인된 인용을 레거시 서버에 전달하고 재시도·역순 응답 이후에도 최신 승인 결과를 유지한다.

**Guardrails**

- 4·5번 lifecycle을 기반으로 quoteUrl·quoteUri·\_misskey_quote와 승인 후 본문 링크를 제공한다.
- pending·거절·철회 때 자동 표현만 숨기고 직접 작성한 본문을 유지한다. invalid FEP를 legacy로 강등하지 않는다.
- 중복·동시·stale 처리로 철회된 Source나 삭제된 Quote를 복구하지 않는다.

**Verification**

- 승인 후 세 속성·원문 링크, 철회 후 자동 표현 제거, 직접 쓴 동일 URL 보존을 payload로 확인한다.
- 중복 요청·승인, 동시 철회, 늦은 Accept, 일시 실패·재전달의 상태 수렴과 실패 관찰을 검증한다.

- [ ] 6.1 승인 조건에 따른 세 호환 속성과 발신 본문 fallback을 연결한다. D15의 기존 두 Quote 표시 예외만으로 승인 객체나 승인된 자동 발신 표현을 생성하지 않는지 검증한다.
- [ ] 6.2 중복·동시·역순 응답 및 delivery 실패·재시도를 최신 상태에 수렴시킨다.
- [ ] 6.3 공식 구현에 근거한 compatibility fixture와 상태·본문 보존 회귀를 검증한다. 잘못된 FEP payload와
      `quoteUrl` 등 legacy 속성이 동시에 있는 fixture가 승인 관계를 만들지 않고 Source를 계속 비노출하는지 포함한다.

- [ ] 6.4 실제 registry의 Activity retry·completion 유실·Worker 재시작·commit/start gap과 동일 receipt replay를 실행해 중복 effect와 Source 부활이 없음을 검증한다.
- [ ] 6.5 과거 요청 Accept/Reject, 철회 선도착, fetch 중 철회, 정책/승인 Update 교차와 queue 역순 전달의 최종 상태를 검증한다.
- [ ] 6.6 PROD-792의 exact Fedify pin·compatibility 증거를 재사용하거나 같은 조건으로 검증하고, 선택한 세트에서 Quote helper와 기존 Follow·Like·EmojiReact·Announce·Note·queue 회귀를 확인한다. 실패하면 수동 검증기로 우회하지 않는다.

## 7. PROD-924 전체 연합 통합 검증과 change 완료

**Authority / Provenance**

- `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`,
  `docs/domain/decisions/0029-quote-consent-and-federation.md`, `memory/issue-openspec-workflow.md`,
  PROD-902, PROD-431, PROD-924.

**Deliverable**

PROD-431·924의 작성·정책·승인·발신 결과가 하나의 사용자 흐름으로 동작하고 전체 change 완료를 증명한다.

**Guardrails**

- 1~6번 전체 task 완료와 인접 PROD-792 수신 경계 연동 증거가 필요하다.
- 현재 명세는 조사 시점의 main 기준이다. 구현 시 PROD-431 미병합 코드를 소비하면 `main → PROD-431 → PROD-924` Stack으로 정렬하고, 이미 병합됐다면 최신 main에서 진행한다.
- 기존 Local Quote 2건의 존재와 무백필·Source 표시 예외는 확정됐으며, 배포 전 정확한 두 identity·Source 결속과 구버전 writer를 확인한다.
- PROD-793의 기존 signed fetch 계약을 축소하지 않는다. PROD-925는 현재 완료 조건이 아니다.
- 일부 PR 완료만으로 archive하지 않으며 다른 이슈의 독립 change도 대신 archive하지 않는다.

**Verification**

- 작성→pending 게시·전달→Accept→Source 표시→원격 승인 철회 또는 Local Source 삭제→Quote audience 철회 전달→제3자 Source 비노출과
  자체 Content 보존을 확인한다.
- 타인 Followers Only 거부·자기 인용 접근, 새 요청의 양방향 차단과 기존 승인 Source의 단방향·역방향·상호
  차단 조회 결과, 제3자 차이, 원문 삭제와 legacy 수신을 통합 확인한다.
- 실제 schema diff의 초기화·기존 승인 보존·배포 순서와 rollback 시 Source 접근 보호를 확인한다.

- [ ] 7.1 PROD-431 작성과 승인·발신·원격 수신·철회 audience forwarding 경계를 연결하는 연합 통합 검증을 수행한다.
- [ ] 7.2 기존 데이터·승인 보존, 기존 Local Quote 2건 무백필·Source 표시 예외·신규 승인 누락 비노출·정책 backfill, API/Worker/consumer 선배포, 새 작성 중단과 승인 조회·철회 처리가 남는 호환 rollback을 확인한다.
- [ ] 7.3 최신 canonical·Linear·OpenSpec과 전체 구현 결과를 대조하고 각 owner의 commit·명령·결과를 연결한다. 필요한 Web 공개 범위·인용 설정 E2E와 접근성·actor 격리, Native release 미검증 범위를 구분한다.
- [ ] 7.4 전체 선언 task 완료 후 delta spec 동기화·archive와 archive 후 validation을 수행한다.
