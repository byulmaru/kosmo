## Why

공개 Profile Home은 현재 Hero부터 시작해 다른 상세 화면과 상단 navigation 위계가 어긋나고, 없는 프로필에서는 상태 본문만 남아 사용자가 돌아갈 수 있는 route chrome이 사라진다. 승인된 Figma PageHeader 계약과 PROD-949에 맞춰 Profile Home의 상단 구조를 모든 지원 layout에서 일관되게 연결해야 한다.

## What Changes

- 공개 Profile Home의 resolved 상태에서 뒤로가기와 프로필 `displayName`을 가진 공용 PageHeader를 Hero 위에 표시한다.
- 동적 표시 이름은 가용 폭에서 한 줄 tail ellipsis로 줄이되 접근성 제목은 전체 값을 유지한다.
- 없는 프로필 상태에서도 빈 제목 PageHeader와 뒤로가기를 유지하고 그 아래에 기존 상태 본문을 표시한다.
- 모바일 Web에서는 route PageHeader와 셸의 메뉴 전용 헤더를 중복 렌더링하지 않는다.
- 기존 ProfileHero, 게시물 본문, loading·query error, 관계 목록과 일반 PageHeader의 여러 줄 reflow는 유지한다.

## Authority / Provenance

- Canonical: `docs/design/page-header.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`
- Linear Contract: `PROD-949`
- Linear Implementations: `PROD-949`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 공개 Profile Home의 PageHeader 내용·상태·소유권과 기존 Profile 본문·상태 보존 요구사항을 추가한다.

## Impact

- 공용 `PageHeader`의 text 제목 줄 수 선택
- 공개 Profile layout의 Relay 표시 이름 조회, resolved·missing 조립과 뒤로가기
- 모바일 Web 셸의 route-owned header 판정
- 관련 단위 테스트와 Web viewport 시각 검증
- Profile query/API schema, ProfileHero·게시물·관계 목록 데이터, loading·query error 동작, 외부 의존성에는 영향이 없다.
