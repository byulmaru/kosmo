## Context

이 기록은 PROD-432·PROD-433·PROD-434의 Linear 경계, `post-action-bar` spec, 현재 React Native 코드 구조와 2026-07-21 사용자 논의에서 확정한 선택을 반영한다. Figma Action node는 시각 참고 자료지만, Figma에 없는 상태와 접근성 동작은 Linear와 이 OpenSpec이 규정한다.

## Decision Records

### 고정된 단일 공개 컴포넌트 API

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: 제품 액션 구성과 순서가 고정되어 있는데도 임의 구성 API나 액션별 공개 컴포넌트를 만들면 필요하지 않은 조합, API 표면과 유지보수 책임이 생긴다.
- Decision Outcome: 공개 UI API는 `PostActionBar` 하나로 제한한다. `reply`, `repost`, `reaction`, `bookmark`, `more`의 명시적 optional prop을 사용하고 이 순서를 고정한다. 반복되는 action control은 모듈 내부 구현으로만 둔다.
- Alternatives Considered: 임의 `actions[]` 배열은 고정 제품 계약에 불필요한 유연성을 추가하므로 채택하지 않았다. Reply·Repost 등 action별 공개 leaf 컴포넌트는 독립 재사용 요구가 없고 공개 API만 넓히므로 채택하지 않았다.
- Consequences: 호출부는 지원하지 않는 액션을 prop 생략으로 표현한다. 새로운 액션이나 순서 변경은 우연히 배열에 추가하는 방식이 아니라 제품 계약과 OpenSpec 변경을 요구한다.
- Confirmation / Follow-up: PROD-433의 공개 export와 Storybook에서 단일 공개 컴포넌트, 고정 순서 및 optional 표시를 검증한다.

### 선택 상태와 처리 상태의 분리

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: selected를 pending·disabled·error와 같은 단일 상태 값으로 모델링하면 selected 액션이 요청 중일 때 선택 의미를 잃고 조합 상태를 표현할 수 없다.
- Decision Outcome: `selected` 의미는 처리 상태(default·pending·disabled·error)와 독립적으로 유지한다. pending은 icon을 spinner로 바꾸고 입력을 차단하지만 selected 접근성 의미를 보존한다. disabled는 입력을 차단하고, error는 danger 표현과 재시도 입력을 허용한다.
- Alternatives Considered: 하나의 상태 enum에 selected·pending·disabled·error를 모두 넣는 방식은 조합 수가 늘고 selected+pending을 자연스럽게 표현하지 못하므로 채택하지 않았다. pending 동안 selected를 숨기는 방식은 실제 viewer-relative 상태를 왜곡하므로 채택하지 않았다.
- Consequences: 상위 계층은 선택 여부와 요청 처리 상태를 별도로 공급한다. component test와 통합 테스트에 selected+pending 조합이 필수다.
- Confirmation / Follow-up: Storybook과 component test에서 selected+pending, callback 차단 및 접근성 selected+busy를 함께 검증한다.

### More는 callback 경계만 제공

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: More는 향후 링크 복사처럼 작은 동작을 담을 수 있지만 현재 이슈에는 메뉴 내용, 열림 상태와 플랫폼별 표현 계약이 없다.
- Decision Outcome: `PostActionBar`는 optional More icon과 callback만 제공한다. 메뉴, popover, bottom sheet, 링크 복사 및 항목 권한은 구현하지 않는다.
- Alternatives Considered: More를 완전히 생략하면 후속 surface에서 Action Bar 공개 계약을 다시 변경해야 하므로 채택하지 않았다. 지금 전체 메뉴를 구현하는 방식은 승인된 제품 계약과 이슈 범위를 넘으므로 채택하지 않았다.
- Consequences: More가 표시된 호출부는 callback의 실제 결과를 별도 후속 계약에서 제공해야 한다. 이 change의 검증은 표시·접근성·callback 호출까지만 다룬다.
- Confirmation / Follow-up: PROD-433은 More callback 호출만 검증하며 메뉴 UI나 링크 복사 테스트를 추가하지 않는다.

### Linear와 OpenSpec을 누락 상태의 구현 계약으로 사용

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: 현재 Figma에는 pending·disabled·error와 최소 44×44 interactive target이 없고, Codex를 통한 Figma 수정은 의도와 다르게 반영될 위험이 있어 같은 세션에서 신뢰할 수 있는 동기화를 보장하기 어렵다.
- Decision Outcome: Figma Action node는 현재 배치·간격·icon·색상의 비규범적 시각 참고로 사용하며 이 change에서 수정하지 않는다. 상태, 입력, 접근성 및 구현 경계는 Linear와 이 OpenSpec을 source of truth로 사용하고 코드가 이를 따라야 한다.
- Alternatives Considered: 구현 전에 Figma variant와 touch target 설명을 추가하는 방식은 도구 반영 신뢰도가 낮고 사용자가 필요할 때 직접 정렬하기로 했으므로 채택하지 않았다. Figma에 없는 상태를 구현하지 않는 방식은 PROD-433의 승인된 완료 조건을 위반하므로 채택하지 않았다.
- Consequences: 일정 기간 Figma와 구현 상태 카탈로그 사이의 차이를 허용한다. 향후 Figma를 정렬할 때 Linear/OpenSpec/코드의 상태 계약을 기준으로 역동기화해야 한다.
- Confirmation / Follow-up: OpenSpec strict validation과 구현 PR 검토에서 Linear·OpenSpec·코드 정합성을 확인한다. Figma 수정은 이 change의 task에 포함하지 않는다.

### 공유 change와 부모 소유의 최종 archive

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: UI 컴포넌트, surface 배치와 실제 action 연결은 별도 PR로 리뷰해야 하지만 하나의 최종 Post Action Bar 결과와 통합 검증을 공유한다.
- Decision Outcome: `add-post-action-bar` 하나가 PROD-432 계약 전체를 소유한다. PROD-433과 PROD-434는 자기 구현과 테스트를 소유하고, PROD-432는 선행 action 연결, 전체 surface 통합 검증, task 정합성 확인과 최종 archive를 소유한다.
- Alternatives Considered: 구현 자식마다 OpenSpec을 복제하면 같은 상태·접근성·배치 계약이 갈라지고 부분 완료를 전체 완료로 오인할 수 있어 채택하지 않았다. 부모를 추적 컨테이너로만 두는 방식은 최종 통합 검증과 archive 소유자가 사라져 채택하지 않았다.
- Consequences: 개별 구현 PR이 완료되어도 공유 change를 부분 archive하지 않는다. 모든 자식과 선행 action이 완료되고 부모 통합 검증이 통과할 때까지 active 상태를 유지한다.
- Confirmation / Follow-up: `tasks.md`를 구현 이슈별로 나누고 PROD-432 마지막 group에 통합 검증과 archive를 둔다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
