## ADDED Requirements

### Requirement: 기본 Quote 작성 진입과 입력

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `docs/design/reply-composer.md`, PROD-431, PROD-902. 클라이언트는 인용 메뉴의 direct Source를 가진 공용 Composer를 제공해야 한다(MUST). 기존 본문·Visibility·Content Warning·Sensitive Media·Media 검증을 재사용하고(MUST), Source preview를 작성 Content로 계산해서는 안 된다(MUST NOT). Reply+Quote 작성 UI·API와 본문 링크의 인용 카드 전환을 제공해서는 안 된다(MUST NOT).

#### Scenario: 기본 작성과 Source preview

- **WHEN** 인용 조건을 통과한 Post에서 `인용하기`를 선택한다
- **THEN** 해당 Post를 direct Source로 표시하고 Reply Parent 없는 Composer를 연다
- **AND** Source가 Quote여도 한 단계 preview만 사용하고 Source의 Source로 대상을 바꾸지 않는다
- **AND** Source의 기존 Content Warning·Sensitive Media 가림 정책을 유지한다

#### Scenario: 공용 입력 제출

- **WHEN** 본문 또는 Ready Media가 있고 기존 입력 검증을 통과해 제출한다
- **THEN** Source ID와 본문·Visibility·Content Warning·Sensitive Media·순서 있는 Media를 기존 작성 mutation으로 보낸다
- **AND** Source 공개 범위가 사용자가 선택한 Quote Visibility를 덮어쓰지 않는다

#### Scenario: 빈 작성 Content

- **WHEN** Source preview만 있고 본문과 Ready Media가 모두 없다
- **THEN** 제출할 수 없다
- **AND** 기존 입력·업로드 오류를 수정한 뒤 제출할 수 있다

### Requirement: 작성 취소와 오류 복구

**Authority / Provenance:** `docs/design/post-action-bar.md`, `docs/design/reply-composer.md`, PROD-431, PROD-924. 클라이언트는 기존 Composer의 폐기 보호·mutation pending·오류 복구를 유지해야 한다(MUST). 제출 중 중복 요청을 막고 실패 시 작성 내용을 보존해야 한다(MUST). PROD-924가 원격 승인 대기 Post를 성공으로 반환하면 이를 게시 실패로 취급해서는 안 된다(MUST NOT).

#### Scenario: 취소와 focus

- **WHEN** 사용자가 기존 작성 surface의 폐기 확인을 거쳐 취소한다
- **THEN** 작성기를 닫고 Post나 connection edge를 만들지 않는다
- **AND** Web의 menu·Composer focus와 dismiss는 기존 surface 계약을 따른다

#### Scenario: 제출 중 상태와 실패

- **WHEN** mutation이 진행 중이거나 생성된 Post 없이 실패한다
- **THEN** 진행 중에는 중복 제출과 dismiss를 막고 실패하면 pending을 종료해 재시도할 수 있게 한다
- **AND** 실패 시 본문·Media·Source 맥락을 보존하며 숨겨진 Source의 존재·Author·Content를 오류로 노출하지 않는다

### Requirement: 서버 결과와 actor별 상태 반영

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/design/post-action-bar.md`, PROD-431, PROD-924. 생성된 Post는 요청 actor의 기존 Relay Environment와 관리 대상 connection에만 반영해야 한다(MUST). 서버의 승인·Source 반환 결과를 유지하고(MUST), 늦은 응답이 다른 actor나 새 draft를 변경해서는 안 된다(MUST NOT).

#### Scenario: 승인 대기 게시 성공

- **WHEN** automatic/manual 광고 또는 `interactionPolicy` 부재·해석 실패와 관계없이 자체 Content가 게시됐지만 Source 승인 대기 상태인 Post를 반환한다
- **THEN** 같은 Post를 성공 결과로 반영하며 Source를 낙관적으로 표시하지 않는다
- **AND** `repostCount`·`viewerRepost`를 Quote 성공 때문에 변경하지 않는다

#### Scenario: 부분 오류와 actor 전환

- **WHEN** 생성된 Post와 nullable field 오류가 함께 오거나 요청 뒤 actor·Environment·draft가 바뀐다
- **THEN** 생성된 Post는 요청 Environment의 성공 결과로 처리하고 자동 재제출하지 않는다
- **AND** 이전 요청의 완료가 새 actor Store·draft·focus·navigation을 변경하지 않는다

#### Scenario: 승인과 철회 뒤 재조회

- **WHEN** 승인·철회·Source 삭제 뒤 같은 Post를 다시 조회한다
- **THEN** 기존 Post identity와 자체 Content를 유지하고 서버가 반환한 Source 또는 null을 표시한다
- **AND** 승인 없이 저장된 Source나 이전 cache만으로 Source를 복원하지 않는다

이 요구사항의 actor별 cache·서버 payload 준수는 PROD-431이 검증하고, 승인 대기·승인·철회 상태를 실제로
생성해 같은 identity로 갱신하는 federation readback은 PROD-924가 검증한다.

### Requirement: 작성 통합과 플랫폼 검증

**Authority / Provenance:** `docs/design/post-action-bar.md`, PROD-431. 기본 Quote의 실제 Web 작성부터 API·저장·조회·표시까지 통합 검증해야 한다(MUST). Web 검사 결과를 Native runtime 완료로 일반화해서는 안 된다(MUST NOT).

#### Scenario: Web 작성 release gate

- **WHEN** 기본 Quote 작성 기능의 출시를 검증한다
- **THEN** 실제 작성 E2E와 keyboard·focus·dismiss·접근성, 실패 복구·actor 격리를 확인한다
- **AND** 기존 Post·Reply·Repost 작성·표시와 Quote of Quote·Source unavailable 회귀를 확인한다

#### Scenario: Native 증거 미실행

- **WHEN** Android/iOS runtime을 실행하지 않았다
- **THEN** Native keyboard·safe area·platform back·접근성은 미검증으로 기록한다
- **AND** Native 출시 전 별도 release gate에서 실행 증거를 확보한다
