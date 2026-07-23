## ADDED Requirements

### Requirement: 기존 composer를 사용한 Reply 작성

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/design/colors.md`, `docs/design/typography.md`, `docs/design/breakpoints.md`, `PROD-423`, `PROD-425` 유니버설 클라이언트는 Post 상세의 contentful Post에서 기존 일반 Post composer를 Reply Parent 맥락으로 열고, 현재 composer가 지원하는 본문과 Visibility로 Reply를 제출해야 한다 (MUST).

#### Scenario: contentful Post에서 Reply 진입

- **WHEN** 사용자가 Content를 가진 일반 Post, Reply 또는 Quote의 상세에서 Reply action을 활성화한다
- **THEN** 클라이언트는 해당 Post를 Parent로 하는 기존 composer를 연다
- **AND** 제출 mutation에 Parent의 concrete `Post` global ID를 `replyParentId`로 전달한다

#### Scenario: Parent와 독립적인 Visibility

- **WHEN** 사용자가 현재 지원되는 범위에서 Parent와 다른 Visibility를 선택하고 Reply를 제출한다
- **THEN** 클라이언트는 Parent Visibility를 복사하거나 강제하지 않고 사용자 선택값을 전송한다

#### Scenario: Content 없는 Repost의 disabled Reply action

- **WHEN** Post 상세 대상이 Content 없는 Repost이다
- **THEN** 클라이언트는 Reply action을 disabled 상태로 표시한다
- **AND** action callback, composer 진입 또는 create mutation을 실행하지 않는다

#### Scenario: 기존 Post payload 재사용

- **WHEN** Reply mutation이 성공한다
- **THEN** 클라이언트는 기존 단일 `Post` fragment와 `CreatePostPayload.post`를 사용해 결과를 처리한다
- **AND** Reply/Repost/Quote Kind enum이나 concrete Post type을 추가하지 않는다

### Requirement: Reply 작성 상태와 thread cache 격리

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-423`, `PROD-425` 클라이언트는 Reply 작성의 validation·pending·실패·성공 상태를 selected Profile별로 격리하고, 성공한 Reply를 현재 Parent thread에 반영해야 한다 (MUST).

#### Scenario: 성공한 Reply의 thread 반영

- **WHEN** 현재 Post 상세에서 Reply mutation이 성공한다
- **THEN** 클라이언트는 성공 payload의 Post를 현재 thread Relay cache에 반영한다
- **AND** 현재 thread의 Parent·조상·하위 Reply 관계를 다른 Post로 평탄화하지 않는다

#### Scenario: validation 또는 network 실패

- **WHEN** Reply 제출이 validation 또는 network 오류로 실패한다
- **THEN** 클라이언트는 현재 작성 내용과 Parent 맥락을 유지해 재시도할 수 있게 한다
- **AND** 실패한 Post를 thread cache에 추가하지 않는다

#### Scenario: selected Profile 전환

- **WHEN** Reply 작성 중 selected Profile이 바뀌거나 다른 Profile의 Relay Environment가 활성화된다
- **THEN** 클라이언트는 이전 Profile의 입력, pending, error, 성공 결과를 새 Profile의 composer나 thread cache에 노출하지 않는다
