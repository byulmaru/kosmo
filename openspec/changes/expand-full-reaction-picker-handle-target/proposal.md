## Why

모바일 앱의 Full Emoji Picker에서 중앙 손잡이를 정확히 잡아야 시트를 조절할 수 있다는 사용자 제보다. 같은 행의 좌우 여백에서도 조절할 수 있게 입력 범위를 명확히 한다. 제보 기기에서 직접 재현한 결과는 아직 없다.

## Goal

iOS·Android Full Picker의 상단 핸들 행에서 중앙·왼쪽·오른쪽 어디서 세로 드래그를 시작해도 기존 손잡이와 같은 펼치기·접기·닫기·취소 결과를 얻는다.

## What Changes

- 시각적 손잡이와 실제 드래그 입력 영역을 분리하고, 같은 핸들 행의 좌우 여백까지 조작 범위에 포함한다.
- 기존 중앙 손잡이의 상태 전이와 접근성 활성화 동작을 유지한다.
- 목록 스크롤·이모지 선택·검색 입력·기존 닫기 동작과 입력 범위가 충돌하지 않게 한다.

## Non-Goals

- 모바일 Web presentation 변경, 스크롤바 추가(PROD-1163), Web 자동 확대 수정(PROD-1174).
- 시트 전이 임계값·높이 정책, Reaction 데이터·mutation, 다른 메뉴의 제품 동작 변경.
- 이 세션의 구현·앱 테스트·실기기 검증·push·PR 생성.

## Constraints

- Web은 기존 anchored dialog, Native는 기존 bottom sheet를 유지한다.
- 보이는 손잡이의 크기·위치를 유지한다. 확장하는 대상은 같은 행의 드래그 시작 영역이다.
- 미확인 배포 버전과 현재 소스의 원인을 동일하다고 단정하지 않는다.
- 공용 시트 수정이 필요하면 기존 ActionMenu 소비처의 동작도 보존한다.

## Verification

좌·중앙·우 각각에서 펼치기, 접기, 닫기, 임계값 미달 복귀, 취소를 실행해 비교한다. 목록·검색에서 시작한 입력과 분리되는지 확인한다. 자동화와 iOS·Android runtime 관찰을 나누고 기기·OS·빌드 식별자를 기록한다. 이번 세션에서는 문서 구조만 검증한다.

## Business Context

- Product canonical: `docs/domain/objects/reaction.md`, `docs/domain/decisions/0016-reaction-selector-current-state.md`. Reaction 의미와 권한은 변경하지 않는다.
- Visual design source: `docs/design/reactions.md`, `docs/design/accessibility.md`.
- Linear: [PROD-1175](https://linear.app/byulmaru/issue/PROD-1175). 관계는 PROD-1163·PROD-942이며 선행 차단 관계는 없다.
- User agreement: 2026-10-20 현재 대화의 이슈별 스펙 작성 요청. 핸들 행 범위와 보존 동작은 Linear에 확정돼 있다.

## Session Status

- Status: Active
- Last updated: 2026-10-20
- Spec만 작성한다. 구현과 runtime 완료는 아직 확인하지 않았다.
