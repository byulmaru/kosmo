## Why

현재 웹 앱은 모바일 중심의 하단 탭 shell만 제공하므로 데스크톱 사용자가 항상 접근할 수 있는 내비게이션 영역이 없고, 앱 shell에서 프로필을 전환할 수도 없다. PROD-77은 데스크톱 사이드바, 모바일 drawer 내비게이션, 즉시 멀티프로필 전환에 필요한 계약을 추가한다.

## What Changes

- 데스크톱 크기 화면에서 고정 노출되는 반응형 웹 사이드바를 추가한다.
- 버튼과 왼쪽 edge swipe 제스처로 열 수 있는 모바일 drawer 형태의 사이드바를 추가한다.
- 모바일 drawer에서 내비게이션 메뉴를 선택하면 drawer를 닫는다.
- 현재 페이지에 해당하는 내비게이션 항목의 active 상태를 표시한다.
- 사이드바에서 멀티프로필 전환을 제공하고 선택한 프로필을 즉시 전환한다.
- 웹 shell이 접근 가능한 프로필 목록과 현재 활성 프로필을 식별하는 데 필요한 GraphQL 조회 계약을 추가한다.

## Capabilities

### New Capabilities

- 없음.

### Modified Capabilities

- `web-app-shell`: 반응형 사이드바, 모바일 drawer 내비게이션, active 항목 상태, shell 수준 프로필 전환 요구사항을 추가한다.
- `profile`: 웹 shell에 필요한 계정 범위 프로필 목록과 활성 프로필 조회 요구사항을 추가한다.

## Impact

- `apps/web`: app shell layout, sidebar/drawer 컴포넌트, 내비게이션 상태, 프로필 전환 UI, GraphQL operation.
- `apps/api`: 인증된 계정의 접근 가능한 프로필과 현재 활성 프로필을 조회하는 GraphQL 필드.
- `openspec`: `web-app-shell`, `profile` delta spec과 구현 task.
