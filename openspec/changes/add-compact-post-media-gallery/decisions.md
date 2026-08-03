## Context

이 결정 기록은 PROD-626의 최신 확정 레이아웃·포함/제외 범위, Post Content·Media canonical 문서, 전역 접근성·breakpoint 기준과 이에 맞춘 gallery spec·design을 반영한다. 구현은 기존 `post-media-display` capability를 확장하며 후속 viewer인 PROD-650의 선택·navigation lifecycle을 포함하지 않는다.

## Decision Records

### 이미지 개수별 gallery surface를 사용한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/breakpoints.md`, PROD-626
- Status: Active
- Context / Problem: 모든 다중 이미지를 세로 나열하면 타임라인이 과도하게 길어지고, 하나의 고정 비율만 모든 개수에 적용하면 특정 개수의 tile이 지나치게 세로로 길어져 crop과 밀도가 불균형해진다.
- Decision Outcome: 한 장은 기존 원본 비율 규칙을 유지한다. 두 장은 token gap·외곽 border를 제외한 이미지 영역 2:1 안에 같은 크기의 정사각 tile 두 개를 배치하고 gallery 높이를 tile 한 변과 외곽 border로 결정한다. 세 장은 전체 4:3에서 첫 이미지 왼쪽 전체 높이와 나머지 오른쪽 위·아래, 네 장은 전체 1:1의 2×2 배치를 사용한다. 모든 배치는 document 순서를 유지한다.
- Alternatives Considered: 외곽 surface를 정확히 2:1로 고정하면서 양수 gap을 layout 공간으로 소비하는 안은 두 tile을 정사각형으로 만들 수 없다. separator를 이미지 위에 겹치는 안은 tile 일부를 가리킨다. 다중 이미지를 모두 4:3 또는 1:1 surface로 표시하는 안은 특정 개수의 tile을 지나치게 세로로 길게 만든다.
- Consequences: 개수별 surface를 별도로 검증해야 하며 다중 tile은 `cover` crop을 허용한다. 새 breakpoint나 route별 배치는 필요하지 않다.
- Confirmation / Follow-up: component/layout test와 Storybook에서 1·2·3·4장의 순서·구조·surface 비율을 검증하고 Web·iOS·Android runtime 결과를 구분해 기록한다.

### Sensitive Media는 개수별 가림 surface를 예약한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/accessibility.md`, PROD-626
- Status: Active
- Context / Problem: 공개 전 이미지를 mount하지 않는 기존 Sensitive 계약을 지키면서 다중 gallery 공개 전후의 큰 layout 이동을 막아야 한다. 한 장은 서버가 원본 크기를 제공하지 않아 공개 전에 실제 비율을 알 수 없다.
- Decision Outcome: 한 장의 가림 surface는 1:1을 사용하고 공개 뒤 기존 단일 이미지 비율 계약으로 전환한다. 두 장은 정사각 tile에서 계산한 gallery 높이, 세 장은 4:3, 네 장은 1:1 surface를 공개 전후에 유지한다. 일반 목록·상세의 공개·다시 가리기 control은 두 상태에서 같은 의미와 focus 경계를 유지한다. 비대화형 Reply Composer 부모 preview는 같은 배치를 사용하되 Sensitive 이미지를 가린 채 공개 control을 제공하지 않는다.
- Alternatives Considered: 공개 전에 이미지를 mount하거나 metadata를 fetch해 한 장 비율을 측정하는 안은 byte 미로드 계약과 서버 범위를 침범한다. 모든 가림 surface에 임의의 공통 높이를 쓰는 안은 다중 gallery 공개 시 layout 이동을 만든다.
- Consequences: 가로 한 장은 공개 뒤 1:1 placeholder보다 낮아질 수 있다. 다중 이미지는 공개 전후 gallery surface 높이가 유지된다.
- Confirmation / Follow-up: Sensitive 1장과 다중 fixture에서 공개 전 이미지 미mount, surface 비율, 공개·다시 가리기와 Web focus 유지 여부를 검증한다.

### 이미지 tile은 viewer 전까지 비상호작용으로 유지한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, PROD-626
- Status: Active
- Context / Problem: Post 목록 shortcut·상세 link와 이미지 tile을 동시에 interactive하게 만들면 중첩 role·focus·event propagation이 생기며 후속 viewer lifecycle을 선점한다.
- Decision Outcome: 정상 이미지 tile 자체에는 button·link role이나 press action을 추가하지 않는다. 일반 목록·상세에서는 Sensitive 공개·다시 가리기와 실패한 이미지 재시도 control을 독립 interactive element로 유지한다. 비대화형 Reply Composer 부모 preview는 같은 gallery 배치와 fallback을 사용하되 내부 control을 제공하지 않는다.
- Alternatives Considered: tile을 바로 상세 viewer trigger로 만드는 안은 PROD-650의 modal·선택 index·navigation 계약에 속하므로 제외한다. Post 전체 navigation을 tile에 복제하는 안은 중첩 semantics를 만든다.
- Consequences: 이번 change는 presentation layout만 독립 완료할 수 있다. PROD-650은 이후 tile interaction을 추가할 때 현재 document 순서와 상태 경계를 소비한다.
- Confirmation / Follow-up: component test와 Web runtime에서 정상 tile이 별도 interactive role을 갖지 않고 내부 control 실행이 Post navigation을 함께 발생시키지 않는지 확인한다. Reply Composer 부모 preview는 Sensitive 공개·재시도 control을 표시하지 않는 기존 동작을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
