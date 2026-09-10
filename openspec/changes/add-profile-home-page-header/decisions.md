## Context

이 기록은 PROD-949와 `docs/design/page-header.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`가 확정한 공개 Profile Home 상단 chrome을 구현하기 위한 durable choice를 정리한다. 내부 파일·helper 선택은 design의 비규범적 권장으로 남긴다.

## Decision Records

### Profile Home route가 resolved와 missing PageHeader를 소유한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/page-header.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`, `PROD-949`
- Status: Active
- Context / Problem: 현재 resolved Profile Home은 Hero부터 시작하고 missing 상태는 본문만 남아, 화면 사이의 navigation 위계와 상태별 chrome이 일치하지 않는다.
- Decision Outcome: Web·Android·iOS의 Profile Home route가 뒤로가기 PageHeader를 소유한다. resolved 제목은 전체 `displayName`, missing 제목은 빈 문자열이며, 모바일 Web 셸은 메뉴 전용 헤더를 중복하지 않는다. PageHeader는 resolved에서 Hero 위에, missing에서 상태 본문 위에 놓는다.
- Alternatives Considered: 모바일 셸이 Profile 제목을 소유하면 breakpoint·Native 간 owner가 갈리고 query data bridge가 필요해 제외했다. missing에서 header를 제거하면 상태 전환 중 chrome 위치가 달라져 제외했다.
- Consequences: route는 Profile 표시 이름을 PageHeader까지 전달하며 missing 본문도 resolved와 같은 route container ownership을 사용한다. loading·query error와 관계 route는 기존 계약을 유지한다.
- Confirmation / Follow-up: resolved·missing route 조립, 모바일 Web 중복 방지와 기존 Hero·본문 보존을 행동 테스트와 Web viewport QA로 확인한다.

### 동적 Profile 제목만 한 줄 tail ellipsis를 선택한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/page-header.md`, `docs/design/figma.md`, `PROD-949`
- Status: Active
- Context / Problem: 긴 `displayName`은 고정된 Profile chrome에서 leading action과 충돌할 수 있지만 일반 PageHeader의 긴 정적 제목은 font scaling과 좁은 폭에서 여러 줄 reflow해야 한다.
- Decision Outcome: Profile Home 제목은 가용 폭에서 한 줄 tail ellipsis로 표시하고 접근성 heading에는 전체 값을 유지한다. 공용 text PageHeader의 기본 동작은 줄 수를 제한하지 않으며 한 줄 정책은 소비처가 명시적으로 선택한다.
- Alternatives Considered: 모든 text 제목을 한 줄로 바꾸는 방식은 기존 reflow 계약을 깨므로 제외했다. Profile 전용 header를 새로 만드는 방식은 공용 geometry와 접근성을 중복해 제외했다.
- Consequences: 공용 PageHeader에는 기본값을 바꾸지 않는 opt-in 경계가 필요하며 Profile Home만 이를 사용한다.
- Confirmation / Follow-up: 공용 component test에서 opt-in과 기본값을 함께 확인하고 긴 이름을 좁은 Web viewport에서 시각 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
