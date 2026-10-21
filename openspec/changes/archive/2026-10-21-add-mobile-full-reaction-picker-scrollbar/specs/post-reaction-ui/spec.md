## ADDED Requirements

### Requirement: 모바일 Full Picker의 기본 스크롤 표시기

시스템은 모바일 Web·iOS·Android Full Picker의 목록에 기본 스크롤 표시기를 사용해야 한다(SHALL). 표시·숨김과 드래그 지원은 OS·브라우저 기본 동작을 따른다. 기존 목록 가상화·검색·선택·Native 시트 동작을 유지해야 한다(SHALL).

**Source Context:** 2026-10-21 사용자의 PR #1223 리뷰 반영 지시, PROD-1163, `docs/design/reactions.md`. 이전 커스텀 바 계약을 대체하는 세션 메모다.

#### Scenario: 목록 스크롤과 검색

- **WHEN** 모바일 Web 또는 Native의 Browse·SearchResults 목록을 스크롤하거나 검색어를 바꾼다
- **THEN** 기본 표시기를 사용하고 기존 검색 초기 위치·선택·focus 동작을 유지한다
- **AND** 표시·숨김 시점과 드래그 지원의 플랫폼 차이를 수용한다

#### Scenario: 기존 상태와 플랫폼 경계

- **WHEN** Empty·Loading을 표시하거나 이모지·검색·Native 시트 핸들을 조작한다
- **THEN** 기존 상태·입력 동작을 유지하고 커스텀 바와 전용 조작 영역을 추가하지 않는다
- **AND** Desktop Web은 기존 표시기 설정을 유지한다
