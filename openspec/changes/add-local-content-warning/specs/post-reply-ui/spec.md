## MODIFIED Requirements

### Requirement: 기존 composer를 사용한 Reply 작성

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/design/reply-composer.md`, `docs/design/colors.md`, `docs/design/typography.md`, `docs/design/breakpoints.md`, `PROD-425`, `PROD-642` 유니버설 클라이언트는 목록·상세의 contentful Post에서 기존 일반 Post composer를 Reply Parent 맥락으로 열고, 현재 composer가 지원하는 본문, optional Content Warning, Visibility와 Media로 Reply를 제출해야 한다(MUST).

#### Scenario: contentful Post에서 Reply 진입

- **WHEN** 사용자가 Content를 가진 일반 Post, Reply 또는 Quote의 목록 또는 상세에서 Reply action을 활성화한다
- **THEN** 클라이언트는 해당 Post를 Parent로 하는 기존 composer를 연다
- **AND** 제출 mutation에 Parent의 concrete `Post` global ID를 `replyParentId`로 전달한다

#### Scenario: Parent Content Warning 초기값

- **WHEN** Content Warning이 있는 direct Parent에서 Reply Composer를 연다
- **THEN** 클라이언트는 Parent의 `contentWarning`을 Reply Content Warning의 초기값으로 한 번 복사한다
- **AND** 사용자는 복사된 값을 자유롭게 수정하거나 제거할 수 있다
- **AND** 복사된 값은 Parent와 계속 동기화되는 상속값이 아니라 독립적인 Reply draft다
- **WHEN** direct Parent에 Content Warning이 없다
- **THEN** Reply Content Warning은 빈 초기값으로 시작한다

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

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/design/reply-composer.md`, `PROD-425`, `PROD-642` 클라이언트는 Reply 작성의 Content Warning·validation·pending·실패·성공 상태를 selected Profile과 Parent 문맥별로 격리하고, 현재 query의 thread 계약을 합성하지 않으면서 성공한 Reply에 접근할 수 있게 해야 한다(MUST).

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
- **THEN** 클라이언트는 이전 Profile의 본문·Content Warning 입력, pending, error, 성공 결과를 새 Profile의 composer나 thread cache에 노출하지 않는다

#### Scenario: Parent 문맥 전환

- **WHEN** Reply 작성 중 다른 direct Parent로 전환한다
- **THEN** 클라이언트는 이전 Parent에서 수정한 Content Warning을 새 draft로 이어받지 않는다
- **AND** 새 Parent의 Content Warning을 새 Reply draft의 초기값으로 한 번 복사한다

### Requirement: surface별 Reply Composer presentation

**Authority / Provenance:** `docs/design/reply-composer.md`, `PROD-425`, `PROD-642` 클라이언트는 목록과 상세의 정보 계층을 유지하면서 같은 Parent·Composer 계약을 surface별 shell로 제공해야 한다(MUST).

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
- **THEN** 클라이언트는 direct Parent의 작성자·시각·Content Warning·전체 본문과 Quote이면 기존 Source preview를 표시한다
- **AND** Source preview는 일반 본문과 같은 background와 semantic border를 사용한다
- **AND** Content Warning reveal control 외의 Parent 맥락은 비대화형이며, Parent 본문과 Media는 canonical `Post.id`의 공용 reveal 상태를 따른다
- **AND** 일반 첨부 이미지는 표시하되 Sensitive Media는 Content Warning reveal과 독립된 가림 상태를 유지하고 공개·이미지 오류 재시도 control을 노출하지 않는다
- **AND** Parent Action Bar·Post menu와 전체 조상 thread를 중복 표시하지 않는다

### Requirement: Reply surface lifecycle

**Authority / Provenance:** `docs/design/reply-composer.md`, `PROD-425`, `PROD-642` Reply surface는 작성 상태에 따라 close·focus·error lifecycle을 일관되게 제어해야 한다(MUST).

#### Scenario: Reply-open dirty와 dirty close

- **WHEN** Reply surface가 열리고 본문, Content Warning과 Visibility가 초기값인 상태에서 `X`, backdrop 또는 `Escape`로 닫는다
- **THEN** 클라이언트는 `답글 작성을 취소할까요?` 확인에서 `계속 작성` 또는 `작성 취소`를 선택하게 한다
- **BUT WHEN** 본문, Content Warning 또는 Visibility가 각 초기값에서 바뀌었거나 Reply surface의 Media 상태가 바뀌었다
- **THEN** 클라이언트는 `답글 작성을 취소할까요?` 확인에서 `계속 작성` 또는 `작성 취소`를 선택하게 한다
- **AND** 상세 inline surface의 현재 Reply action 재활성화와 다른 Parent Reply action 선택도 같은 확인 lifecycle을 사용한다
- **AND** Parent에서 복사된 Content Warning은 독립 Reply draft이며, 이를 수정하거나 제거하면 draft 변경으로 dirty 상태를 유지한다

#### Scenario: pending close 차단

- **WHEN** Reply 제출이 pending이다
- **THEN** 클라이언트는 본문·Content Warning·Visibility 변경과 `X`, backdrop, `Escape`, platform back 또는 상세 Reply action을 통한 close·Parent 전환을 차단한다
- **AND** button에 `게시 중` 상태를 표시한다

#### Scenario: 실패와 성공 close

- **WHEN** validation 또는 network 오류가 발생한다
- **THEN** 클라이언트는 direct Parent, 본문, Content Warning과 Visibility를 유지하고 editor와 footer 사이에 accessible inline alert를 표시한다
- **WHEN** mutation이 성공한다
- **THEN** 클라이언트는 surface를 닫고 원래 Reply action으로 focus를 복원하며 약 3초 뒤 자동으로 사라지는 `답글을 게시했어요` snackbar와 표시 중 결과 Reply `보기` action을 표시한다
- **AND** 사용자가 `보기`를 활성화할 때만 결과 Reply 상세로 이동한다
- **AND** 상세 route는 현재 query만 targeted refetch하고 목록 membership이나 다른 actor Store를 합성하지 않는다

## ADDED Requirements
