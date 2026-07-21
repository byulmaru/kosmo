## Context

이 기록은 PROD-432·PROD-433·PROD-434의 Linear 경계, `post-action-bar` spec, 현재 React Native 코드 구조와 2026-07-21 KST 사용자 논의에서 확정한 선택을 반영한다. Figma Action node는 비규범적 시각 참고 자료다.

## Decision Records

### 고정된 단일 공개 컴포넌트 API

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: 제품 액션 구성과 순서가 고정되어 있는데도 임의 구성 API나 액션별 공개 컴포넌트를 만들면 필요하지 않은 조합, API 표면과 유지보수 책임이 생긴다.
- Decision Outcome: 공개 UI API는 `PostActionBar` 하나로 제한한다. `reply`, `repost`, `reaction`, `bookmark`, `more`의 명시적 optional prop을 사용하고 이 순서를 고정한다. 반복되는 action control은 모듈 내부 구현으로만 둔다.
- Alternatives Considered: 임의 `actions[]` 배열은 고정 제품 계약에 불필요한 유연성을 추가하므로 채택하지 않았다. Reply·Repost 등 action별 공개 leaf 컴포넌트는 독립 재사용 요구가 없고 공개 API만 넓히므로 채택하지 않았다.
- Consequences: 독립 컴포넌트 사용은 지원하지 않는 액션을 prop 생략으로 표현할 수 있다. production Post surface는 다섯 액션을 모두 제공하고 Post Kind·Post Visibility·권한상 실행할 수 없는 액션을 disabled로 표현한다. 새로운 액션이나 순서 변경은 제품 계약과 OpenSpec 변경을 요구한다.
- Confirmation / Follow-up: PROD-433의 공개 export와 Storybook에서 단일 공개 컴포넌트, 고정 순서 및 optional 표시를 검증한다.

### 선택 상태와 처리 상태의 분리

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: selected를 pending·disabled·error와 같은 단일 상태 값으로 모델링하면 selected 액션이 요청 중일 때 선택 의미를 잃고 조합 상태를 표현할 수 없다. 반대로 Reply처럼 지속적인 선택 의미가 없는 액션까지 selected를 강제하면 작성 이력이나 composer 열림을 임의의 선택 상태로 해석하게 된다. More의 누름이나 팝업 열림도 지속적인 의미적 선택 상태가 아니다.
- Decision Outcome: Repost·Bookmark와 PROD-417·PROD-418의 공개 계약이 selected 의미를 제공한 Reaction만 `selected`를 처리 상태(default·pending·disabled·error)와 독립적으로 유지한다. Reply는 selected를 받지 않는다. 처리 상태의 시각 표현은 selected의 primary 표현보다 우선한다. pending은 icon을 spinner로 바꾸고 입력을 차단하며, disabled는 비활성 표현으로 입력을 차단하고, error는 danger 표현으로 재시도 입력을 허용한다. 세 조합 모두 지원 액션의 selected 의미와 접근성 상태를 보존한다. More는 count·selected·처리 상태 없이 callback과 접근성 label만 받는다.
- Alternatives Considered: 하나의 상태 enum에 selected·pending·disabled·error를 모두 넣는 방식은 조합 수가 늘고 selected+pending을 자연스럽게 표현하지 못하므로 채택하지 않았다. pending 동안 selected를 숨기는 방식은 실제 viewer-relative 상태를 왜곡하므로 채택하지 않았다.
- Consequences: 상위 계층은 selected를 지원하는 액션의 선택 여부와 모든 액션의 요청 처리 상태를 별도로 공급한다. Reply config에는 selected가 없고, component test와 통합 테스트는 selected 지원 액션의 selected+pending·selected+disabled·selected+error 조합을 검증한다.
- Confirmation / Follow-up: Storybook과 component test에서 세 조합의 시각 우선순위, callback 허용 여부 및 접근성 selected와 처리 상태를 함께 검증한다.

### More 컴포넌트 경계와 링크 복사 통합을 분리

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: More는 현재 링크 복사 하나만 필요하지만 공통 Action Bar가 팝업·clipboard·플랫폼별 메뉴 상태까지 소유하면 UI 컴포넌트와 production surface 책임이 결합된다.
- Decision Outcome: `PostActionBar`는 optional More icon, callback과 접근성 label만 제공한다. PROD-432의 production surface 통합은 callback으로 접근 가능한 최소 팝업을 열고 `링크 복사` 한 항목을 제공한다. 공유 URL은 기존 `/{relativeHandle}/{postId}` route를 canonical web origin에 결합한 query·hash 없는 절대 URL이며, Web은 현재 browser origin, Android·iOS는 검증된 `EXPO_PUBLIC_WEB_ORIGIN`을 사용한다. API origin이나 native deep link는 사용하지 않고 guest도 링크 복사를 인증 없이 사용할 수 있다.
- Alternatives Considered: More를 완전히 생략하면 production 계약을 다시 변경해야 하므로 채택하지 않았다. 공통 컴포넌트가 팝업과 clipboard를 직접 소유하는 방식은 surface 통합 책임을 침범하므로 채택하지 않았다. 여러 메뉴 항목을 미리 추가하는 방식은 승인된 범위를 넘으므로 채택하지 않았다.
- Consequences: PROD-433은 More의 표시·접근성·callback만 검증하고, PROD-432가 팝업·링크 복사와 guest 동작을 통합 검증한다. 링크 복사 외 메뉴 항목은 후속 제품 계약을 요구한다.
- Confirmation / Follow-up: PROD-433 component test와 PROD-432 integration test의 검증 책임을 분리한다.

### canonical 문서·Linear·OpenSpec·Figma의 source hierarchy

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: 현재 Figma에는 pending·disabled·error와 최소 44×44 interactive target이 없고, 도구를 통한 수정 결과를 신뢰할 수 있는 동기화 기준으로 삼기 어렵다. 동시에 제품 정책과 작업 범위, 규범적 UI 계약의 소유권을 구분해야 한다.
- Decision Outcome: `docs/domain`·`docs/design`은 제품·디자인의 canonical source, Linear는 범위·소유권·의존성의 source, 이 OpenSpec은 상태·입력·접근성·통합 동작의 규범 계약으로 사용한다. Figma Action node는 배치·간격·icon·색상의 비규범적 시각 참고로만 사용하며 이 change에서 수정하지 않는다.
- Alternatives Considered: 구현 전에 Figma variant와 touch target 설명을 추가하는 방식은 도구 반영 신뢰도가 낮고 사용자가 필요할 때 직접 정렬하기로 했으므로 채택하지 않았다. Figma에 없는 상태를 구현하지 않는 방식은 PROD-433의 승인된 완료 조건을 위반하므로 채택하지 않았다.
- Consequences: 일정 기간 Figma와 구현 상태 카탈로그 사이의 차이를 허용한다. 향후 Figma를 정렬할 때 canonical 문서·Linear·OpenSpec·코드의 소유 경계를 기준으로 역동기화해야 한다.
- Confirmation / Follow-up: OpenSpec strict validation과 구현 PR 검토에서 Linear·OpenSpec·코드 정합성을 확인한다. Figma 수정은 이 change의 task에 포함하지 않는다.

### 공유 change와 부모 소유의 최종 archive

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: UI 컴포넌트, surface 배치와 실제 action 연결은 별도 PR로 리뷰해야 하지만 하나의 최종 Post Action Bar 결과와 통합 검증을 공유한다.
- Decision Outcome: `add-post-action-bar` 하나가 PROD-432 계약 전체를 소유한다. PROD-433과 PROD-434는 자기 구현과 테스트를 소유하고, PROD-432는 선행 action 연결, 전체 surface 통합 검증, task 정합성 확인과 최종 archive를 소유한다.
- Alternatives Considered: 구현 자식마다 OpenSpec을 복제하면 같은 상태·접근성·배치 계약이 갈라지고 부분 완료를 전체 완료로 오인할 수 있어 채택하지 않았다. 부모를 추적 컨테이너로만 두는 방식은 최종 통합 검증과 archive 소유자가 사라져 채택하지 않았다.
- Consequences: 개별 구현 PR이 완료되어도 공유 change를 부분 archive하지 않는다. 모든 자식과 선행 action이 완료되고 부모 통합 검증이 통과할 때까지 active 상태를 유지한다.
- Confirmation / Follow-up: `tasks.md`를 구현 이슈별로 나누고 PROD-432 마지막 group에 통합 검증과 archive를 둔다.

### count는 K/M 단위 최대 네 글자로 표시

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: 원본 count 길이를 제한하지 않으면 compact 폭에서 다섯 액션, 16px icon/count와 44×44 target을 한 행으로 유지하는 요구사항을 검증할 수 없다.
- Decision Outcome: 0~999는 원문, 1,000 이상은 K, 1,000,000 이상은 M 단위를 사용한다. 단위 값이 10 미만일 때만 소수 한 자리를 반올림하고 `.0`은 생략하며, 그 이상은 정수로 반올림한다. K 반올림 결과가 1,000K면 M으로 승격하고, M 반올림 결과가 1,000M에 도달하거나 원본 count가 10억 이상이면 `999M`으로 상한 표시해 최대 네 글자를 유지한다.
- Alternatives Considered: 무제한 원본 숫자는 compact layout 계약과 충돌하므로 채택하지 않았다. locale별 장문 표기와 B 단위는 현재 필요하지 않고 폭 계약을 넓히므로 채택하지 않았다.
- Consequences: count의 정확한 원본 값과 집계 의미는 선행 action 계약이 소유하고, Action Bar는 동일한 compact 표시 규칙만 소유한다.
- Confirmation / Follow-up: 999, 1,000, 1,234, 9,999, 999,999, 1,000,000과 1,000,000,000 경계를 component test에서 검증한다.

### 실행할 수 없는 액션은 숨기지 않고 disabled로 유지

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: Post Kind·Post Visibility·권한에 따라 액션을 생략하면 고정 구성의 위치가 흔들리고 사용자가 기능의 존재와 현재 사용할 수 없는 이유를 구분하기 어렵다.
- Decision Outcome: production Post surface는 다섯 액션을 모두 렌더한다. canonical 정책상 실행할 수 없는 액션은 optional prop을 생략하지 않고 disabled 상태로 제공한다. Repost Kind는 Reply·Repost를 disabled로 표시한다. guest의 Reply·Repost·Reaction·Bookmark는 인증 여부만으로 숨기거나 비활성화하지 않고 상위 인증 진입 callback으로 위임한다.
- Alternatives Considered: 정책상 불가능한 액션을 숨기는 방식은 고정 구성을 깨므로 채택하지 않았다. guest 액션을 disabled로 두는 방식은 인증·가입 진입점을 제공하지 못하므로 채택하지 않았다.
- Consequences: 실제 허용 여부는 canonical 문서와 선행 action 계약이 소유하고 Action Bar는 전달된 disabled 상태만 표현한다. guest 인증 목적지·화면 전환·임시 화면은 이 change에서 구현하지 않는다.
- Confirmation / Follow-up: PROD-432 통합 검증에서 Repost Kind, Visibility·권한 제한, guest 인증 위임을 확인한다.

## Remaining Decisions

- Reaction count 집계와 selected 의미는 PROD-417·PROD-418이 해당 기능의 공개 계약에서 결정한다. PROD-432는 그 결과를 재정의하지 않고 소비하며, 두 의미가 확정되기 전에는 실제 Reaction 상태 연결과 최종 archive를 완료하지 않는다.

## Superseded Decisions

- 없음.
