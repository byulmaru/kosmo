## Why

모바일 Full Emoji Picker 목록에 스크롤바가 없어 현재 위치를 파악하기 어렵다는 사용자 제보다. 현재 위치를 보여 주고 드래그로 빠르게 이동할 수 있게 한다. 최초 제보의 플랫폼·OS와 실제 재현 결과는 아직 확인하지 않았다.

## Goal

모바일 Web·iOS·Android에서 스크롤 중 현재 목록 위치를 확인하고, 표시된 바를 잡아 앞·중간·끝으로 빠르게 이동할 수 있다.

## What Changes

- 스크롤 가능한 목록에 일시적으로 바를 표시한다. 바를 드래그하는 동안에는 표시를 유지한다.
- 일반 목록 스크롤과 바의 위치를 맞추고, 검색·목록 크기·화면 크기가 바뀌어도 유효한 범위를 유지한다.
- 짧은 목록·Empty·Loading에서는 이동할 바를 숨긴다.
- 이모지 선택·검색·목록 스크롤·Native 시트 핸들과 조작 영역을 분리한다.

## Non-Goals

- Desktop Web 스크롤바 변경, 카탈로그·최근 사용 정책·Reaction mutation 변경.
- 시트 핸들 영역 확장(PROD-1175), Web 자동 확대 수정(PROD-1174), 공용 스크롤바 라이브러리 도입.
- 이 세션의 구현·앱 테스트·실기기 검증·push·PR 생성.

## Constraints

- 모바일 Web은 기존 Web dialog를, Native는 기존 bottom sheet를 유지한다.
- 스크롤바를 항상 표시하지 않는다. 목록 스크롤 또는 바 조작이 끝나면 다시 숨긴다.
- 시각적 바와 실제 조작 영역을 구분하며, 기존 이모지 target이나 검색 입력을 덮지 않는다.
- Web·iOS·Android의 기존 접근성 기준과 font scaling·safe area·keyboard 동작을 유지한다.

## Verification

플랫폼별로 긴 Browse·긴 검색 결과의 일반 스크롤과 바 드래그를 실행한다. 앞·중간·끝, 조작 취소, 검색 변경, overflow 제거, 회전·글자 크기·시트 높이 변경과 비간섭을 확인한다. 자동화와 실제 기기 관찰을 구분한다. 이번 세션에서는 문서 구조만 검증한다.

## Business Context

- Product canonical: `docs/domain/objects/reaction.md`, `docs/domain/decisions/0016-reaction-selector-current-state.md`. 데이터 의미·권한은 변경하지 않는다.
- Visual design source: `docs/design/reactions.md`, `docs/design/accessibility.md`, `docs/design/typography.md`.
- Linear: [PROD-1163](https://linear.app/byulmaru/issue/PROD-1163). 사용자 결정을 본문에 반영하고 다시 읽어 확인했다.
- User agreement: 2026-10-20 현재 대화에서 모바일 Web·iOS·Android 모두 적용, 스크롤 중에만 표시하되 표시 중 바 드래그로 빠른 이동을 지원하기로 결정했다.

## Session Status

- Status: Active
- Last updated: 2026-10-20
- Spec만 작성한다. 구현과 runtime 완료는 아직 확인하지 않았다.
