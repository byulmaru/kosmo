## ADDED Requirements

### Requirement: Reply Composer Profile mention 재사용

PROD-652에 따라 모든 Reply Composer는 일반 Post Composer의 Profile mention 계약을 재사용해야 한다(MUST).
Profile 검색·선택, Plain Text mention과 Mentioned Profile ID 제출을 공유하며 Reply 전용 mention state, 검색 API
또는 mutation을 만들어서는 안 된다(MUST NOT).

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`,
`docs/design/reply-composer.md`, `docs/design/accessibility.md`, `PROD-652`

#### Scenario: Reply에서 Profile 검색·선택

- **WHEN** 사용자가 목록 modal·좁은 Web/Native 전체 화면 또는 상세 inline Reply Composer에서 `@` 검색어를 입력하고 Profile을 선택한다
- **THEN** 클라이언트는 일반 Composer와 같은 `searchProfiles` 결과, `relativeHandle` 삽입과 Profile global ID 상태를 사용한다
- **AND** `createPost` 입력에 direct Parent의 `replyParentId`와 중복 없는 `mentionedProfileIds`를 함께 전달한다
- **AND** Reply Visibility는 Parent와 독립적인 현재 선택값을 유지하고 `DIRECT`는 계속 노출하지 않는다

#### Scenario: Reply surface 검색 결과 접근성

- **WHEN** Reply modal 또는 inline surface에서 Profile 검색 결과가 열린다
- **THEN** 검색 결과와 editor는 기존 Reply focus trap·단일 중앙 scroll·keyboard avoidance 경계 안에 유지된다
- **AND** 결과 선택·dismiss 뒤 editor 또는 해당 control로 focus를 복원한다
- **AND** Parent preview를 대화형 검색 결과로 취급하거나 Parent route로 이동하지 않는다

#### Scenario: Reply dirty와 discard 상태

- **WHEN** 사용자가 Reply에서 Profile을 선택했거나 삽입된 mention text를 편집한다
- **THEN** 기존 Reply surface는 이를 작성 dirty 상태로 취급한다
- **AND** close 또는 Parent 전환은 기존 discard confirmation을 따른다
- **AND** 확인된 폐기 뒤 이전 검색 completion이 닫힌 surface나 새 Parent의 mention 상태를 복원하지 않는다

#### Scenario: Reply context 전환과 실패

- **WHEN** selected Profile, direct Parent 또는 Relay Environment가 바뀌거나 Reply 제출이 실패한다
- **THEN** context 전환은 이전 mention occurrence·Profile ID와 늦은 검색 completion을 새 context에서 제거한다
- **AND** 제출 실패는 현재 Parent, 본문, mention occurrence·Profile ID, Visibility와 Media를 유지해 재시도할 수 있게 한다

#### Scenario: 기존 Reply와 일반 Post 회귀 방지

- **WHEN** 사용자가 Mentioned Profile을 선택하지 않고 일반 Post 또는 Reply를 작성한다
- **THEN** 기존 Plain Text·Media·Visibility·pending·success와 cache 동작을 유지한다
- **AND** Mentioned Profile ID 목록을 생략하거나 빈 목록으로 제출해도 기존 작성 결과가 달라지지 않는다
