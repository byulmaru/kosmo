# post-reply-ui Specification

## Purpose

Post 상세에서 조회 가능한 Reply 조상 경로, 현재 Post와 하위 Reply를 기존 Post rendering과 API visibility 경계를 유지하는 하나의 thread로 표시하고, Web과 Native scroll owner에서 하위 Reply pagination을 이어가는 클라이언트 계약을 문서화한다.

## Requirements

### Requirement: Post 상세 Reply thread 통합

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-422` 유니버설 클라이언트는 Post 상세에서 API가 제공한 조회 가능한 조상 경로, 현재 Post와 조회 가능한 하위 Reply를 하나의 thread 맥락으로 연결해야 한다(MUST).

#### Scenario: Reply 상세 thread 표시

- **WHEN** 사용자가 조상과 하위 Reply가 있는 Post 상세를 연다
- **THEN** 클라이언트는 조회 가능한 조상 경로, 현재 Post와 조회 가능한 하위 Reply를 같은 thread 맥락으로 표시한다
- **AND** 각 Post는 기존 단일 Post fragment와 rendering 계약을 사용한다

#### Scenario: Reply이면서 Quote인 Post 표시

- **WHEN** thread에 Reply Parent와 Repost Source를 함께 가진 Post가 포함된다
- **THEN** 클라이언트는 Reply thread 맥락과 Quote의 Content·Repost Source 맥락을 함께 유지한다
- **AND** Repost Source가 조회되면 Reply+Quote의 기존 바깥 Post renderer 아래에 기존 목록 Post renderer를 사용한 테두리 있는 Source sibling을 표시한다
- **AND** Repost Source를 조회할 수 없으면 Reply thread와 Quote의 자체 Content를 유지하고 Source preview만
  표시하지 않는다

#### Scenario: 하위 Reply 다음 page 자동 연결

- **WHEN** 조회 가능한 하위 Reply가 다음 page에 남아 있고 사용자가 thread 끝에서 한 viewport 이내로 스크롤한다
- **THEN** 클라이언트는 다음 page에서 최대 20개 Reply를 자동으로 요청하고 기존 항목 뒤에 API 정렬 순서대로 이어 붙인다
- **AND** Web은 document/window를 scroll owner로 유지하고 internal scroller를 만들지 않으며, Native는 sticky-header `ScrollView`를 유지한다
- **AND** 두 경로는 `contentLength - offset - viewportLength <= viewportLength`인 같은 한-viewport near-end 판정과 요청 중 중복 요청을 막는 guard를 공유한다
- **AND** 같은 page 요청이 진행 중이면 추가 scroll·layout event로 중복 요청하지 않는다

#### Scenario: 짧은 초기 thread 채우기

- **WHEN** 초기 하위 Reply page를 표시한 content가 viewport보다 짧고 다음 page가 남아 있다
- **THEN** 클라이언트는 viewport를 채우거나 다음 page가 없어질 때까지 같은 pagination guard로 page를 이어서 요청한다

#### Scenario: 하위 Reply 다음 page 실패

- **WHEN** 다음 하위 Reply page 요청이 실패한다
- **THEN** 클라이언트는 이미 표시한 thread 항목을 유지한다
- **AND** 실패한 cursor 경계에서 다음 page를 다시 요청할 수 있는 inline retry를 표시한다

#### Scenario: 조회 불가능한 조상 경계

- **WHEN** API가 조회 불가능한 Parent 또는 중간 조상에서 경로를 중단한다
- **THEN** 클라이언트는 API가 제공한 경계까지만 thread를 표시한다
- **AND** 숨겨진 Post를 우회 노출하거나 thread 관계를 평탄화하지 않는다

#### Scenario: thread Post 상세 이동

- **WHEN** 사용자가 thread에 표시된 조회 가능한 Post를 선택한다
- **THEN** 클라이언트는 해당 Post 상세로 이동한다

### Requirement: 기존 composer를 사용한 Reply 작성

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/design/reply-composer.md`, `docs/design/colors.md`, `docs/design/typography.md`, `docs/design/breakpoints.md`, `PROD-425` 유니버설 클라이언트는 목록·상세의 contentful Post에서 기존 일반 Post composer를 Reply Parent 맥락으로 열고, 현재 composer가 지원하는 본문과 Visibility로 Reply를 제출해야 한다(MUST).

#### Scenario: contentful Post에서 Reply 진입

- **WHEN** 사용자가 Content를 가진 일반 Post, Reply 또는 Quote의 목록 또는 상세에서 Reply action을 활성화한다
- **THEN** 클라이언트는 해당 Post를 Parent로 하는 기존 composer를 연다
- **AND** 제출 mutation에 Parent의 concrete `Post` global ID를 `replyParentId`로 전달한다

#### Scenario: Parent와 독립적인 Visibility

- **WHEN** 사용자가 현재 지원되는 범위에서 Parent와 다른 Visibility를 선택하고 Reply를 제출한다
- **THEN** 클라이언트는 Parent Visibility를 복사하거나 강제하지 않고 사용자 선택값을 전송한다

#### Scenario: 목록·상세 Content 없는 Repost의 disabled Reply action

- **WHEN** 목록 또는 Post 상세의 display Post가 Content 없는 Repost이다
- **THEN** 클라이언트는 Reply action을 disabled 상태로 표시한다
- **AND** action callback, composer 진입 또는 create mutation을 실행하지 않는다
- **AND** Repost action이 direct Source를 target으로 유지하더라도 Reply eligibility는 바깥 contentless Repost identity에서 disabled로 유지된다

#### Scenario: 기존 Post payload 재사용

- **WHEN** Reply mutation이 성공한다
- **THEN** 클라이언트는 기존 단일 `Post` fragment와 `CreatePostPayload.post`를 사용해 결과를 처리한다
- **AND** Reply/Repost/Quote Kind enum이나 concrete Post type을 추가하지 않는다

### Requirement: Reply 작성 상태와 thread cache 격리

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/design/reply-composer.md`, `PROD-425` 클라이언트는 Reply 작성의 validation·pending·실패·성공 상태를 selected Profile별로 격리하고, 현재 query의 thread 계약을 합성하지 않으면서 성공한 Reply에 접근할 수 있게 해야 한다(MUST).

#### Scenario: 성공한 Reply의 thread 반영

- **WHEN** 현재 Post 상세에서 Reply mutation이 성공한다
- **THEN** 클라이언트는 surface를 닫고 현재 detail query만 targeted refetch한다
- **AND** 성공 payload의 Post가 현재 query 범위에 포함되면 기존 thread 정렬에 따라 표시한다
- **AND** 약 3초 뒤 자동으로 사라지는 `답글을 게시했어요` snackbar와 표시 중 결과 Reply로 이동하는 `보기` action을 제공한다
- **AND** 자동으로 결과 Reply로 이동하거나 현재 thread의 Parent·조상·하위 Reply 관계와 pagination membership을 합성·평탄화하지 않는다

#### Scenario: validation 또는 network 실패

- **WHEN** Reply 제출이 validation 또는 network 오류로 실패한다
- **THEN** 클라이언트는 현재 작성 내용과 Parent 맥락을 유지해 재시도할 수 있게 한다
- **AND** 실패한 Post를 thread cache에 추가하지 않는다

#### Scenario: selected Profile 전환

- **WHEN** Reply 작성 중 selected Profile이 바뀌거나 다른 Profile의 Relay Environment가 활성화된다
- **THEN** 클라이언트는 이전 Profile의 입력, pending, error, 성공 결과를 새 Profile의 composer나 thread cache에 노출하지 않는다

### Requirement: surface별 Reply Composer presentation

**Authority / Provenance:** `docs/design/reply-composer.md`, `PROD-425` 클라이언트는 목록과 상세의 정보 계층을 유지하면서 같은 Parent·Composer 계약을 surface별 shell로 제공해야 한다(MUST).

#### Scenario: 넓은 Web 목록의 modal

- **WHEN** Web `>= compact` 목록에서 Reply action을 활성화한다
- **THEN** 클라이언트는 너비 600px, 높이 `min(720px, 85dvh)`인 이름 `답글 쓰기`의 modal dialog를 연다
- **AND** header와 footer는 고정하고 direct Parent와 editor를 하나의 중앙 scroll 영역에서 함께 스크롤한다
- **AND** 배경 document scroll을 잠그고 focus를 dialog 안에 유지한다

#### Scenario: 좁은 목록의 전체 화면 composer

- **WHEN** Web `< compact` 또는 Android·iOS 목록에서 Reply action을 활성화한다
- **THEN** 클라이언트는 같은 Parent·Composer 계약을 전체 화면 작성 surface로 연다
- **AND** platform의 safe area, keyboard와 back action을 따른다

#### Scenario: 상세 thread의 행별 inline composer

- **WHEN** Post 상세의 current·ancestor·descendant 행에서 Reply action을 활성화한다
- **THEN** thread owner는 해당 direct Parent 하나를 active 상태로 제어하고 그 행에 기존 Composer를 inline으로 펼친다
- **AND** 같은 `PostListItem`이 목록에서도 사용된다는 이유로 modal이나 전체 화면 shell을 열지 않는다

#### Scenario: direct Parent presentation

- **WHEN** Reply surface가 열린다
- **THEN** 클라이언트는 direct Parent의 작성자·시각·전체 본문과 Quote이면 기존 Source preview를 비대화형으로 표시한다
- **AND** Source preview는 일반 본문과 같은 background와 semantic border를 사용한다
- **AND** 일반 첨부 이미지는 표시하되 Sensitive Media는 가림 상태를 유지하고 공개·이미지 오류 재시도 control을 노출하지 않는다
- **AND** Parent Action Bar·Post menu와 전체 조상 thread를 중복 표시하지 않는다

### Requirement: Reply surface lifecycle

**Authority / Provenance:** `docs/design/reply-composer.md`, `PROD-425` Reply surface는 작성 상태에 따라 close·focus·error lifecycle을 일관되게 제어해야 한다(MUST).

#### Scenario: pristine과 dirty close

- **WHEN** 초기 본문과 Visibility가 유지된 surface를 `X`, backdrop 또는 `Escape`로 닫는다
- **THEN** 클라이언트는 즉시 닫고 원래 Reply action으로 focus를 복원한다
- **BUT WHEN** 본문 또는 Visibility가 초기값에서 바뀌었다
- **THEN** 클라이언트는 `답글 작성을 취소할까요?` 확인에서 `계속 작성` 또는 `작성 취소`를 선택하게 한다
- **AND** 상세 inline surface의 현재 Reply action 재활성화와 다른 Parent Reply action 선택도 같은 확인 lifecycle을 사용한다

#### Scenario: pending close 차단

- **WHEN** Reply 제출이 pending이다
- **THEN** 클라이언트는 본문·Visibility 변경과 `X`, backdrop, `Escape`, platform back 또는 상세 Reply action을 통한 close·Parent 전환을 차단한다
- **AND** button에 `게시 중` 상태를 표시한다

#### Scenario: 실패와 성공 close

- **WHEN** validation 또는 network 오류가 발생한다
- **THEN** 클라이언트는 direct Parent, 본문과 Visibility를 유지하고 editor와 footer 사이에 accessible inline alert를 표시한다
- **WHEN** mutation이 성공한다
- **THEN** 클라이언트는 surface를 닫고 원래 Reply action으로 focus를 복원하며 약 3초 뒤 자동으로 사라지는 `답글을 게시했어요` snackbar와 표시 중 결과 Reply `보기` action을 표시한다
- **AND** 사용자가 `보기`를 활성화할 때만 결과 Reply 상세로 이동한다
- **AND** 상세 route는 현재 query만 targeted refetch하고 목록 membership이나 다른 actor Store를 합성하지 않는다
