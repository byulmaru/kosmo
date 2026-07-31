## Context

이 기록은 PROD-432·PROD-433·PROD-434의 Linear 경계, `post-action-bar` spec, 현재 React Native 코드 구조와 2026-07-21·2026-07-23·2026-07-24 KST 사용자 논의에서 확정한 선택을 반영한다. Figma Action node는 비규범적 시각 참고 자료다.

## Decision Records

### 고정된 단일 공개 컴포넌트 API

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-432`, `PROD-433`
- Status: Superseded
- Context / Problem: 제품 액션 구성과 순서가 고정되어 있는데도 임의 구성 API나 액션별 공개 컴포넌트를 만들면 필요하지 않은 조합, API 표면과 유지보수 책임이 생긴다.
- Decision Outcome: 공개 UI API는 `PostActionBar` 하나로 제한한다. `reply`, `repost`, `reaction`, `bookmark`, `more`의 명시적 optional prop을 사용하고 이 순서를 고정한다. 반복되는 action control은 모듈 내부 구현으로만 둔다.
- Alternatives Considered: 임의 `actions[]` 배열은 고정 제품 계약에 불필요한 유연성을 추가하므로 채택하지 않았다. Reply·Repost 등 action별 공개 leaf 컴포넌트는 독립 재사용 요구가 없고 공개 API만 넓히므로 채택하지 않았다.
- Consequences: 독립 컴포넌트 사용은 지원하지 않는 액션을 prop 생략으로 표현할 수 있다. production Post surface는 다섯 액션을 모두 제공하고 Content·Reply Parent·Repost Source 관계 조합, Post Visibility 또는 권한상 실행할 수 없는 액션을 disabled로 표현한다. 새로운 액션이나 순서 변경은 제품 계약과 OpenSpec 변경을 요구한다.
- Confirmation / Follow-up: PROD-433의 공개 export와 Storybook에서 단일 공개 컴포넌트, 고정 순서 및 optional 표시를 검증한다.

### Post fragment와 private action을 단일 공개 컴포넌트에 조립한다

- Decision Date: 2026-07-26
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-432`, `PROD-433`, `PROD-414`
- Status: Superseded
- Context / Problem: 제품 액션 구성과 순서가 고정되어 있는데도 임의 구성 API나 액션별 공개 컴포넌트를 만들면 필요하지 않은 조합, API 표면과 유지보수 책임이 생긴다. 동시에 Repost의 viewer-relative 상태와 mutation identity는 하나의 fragment-owned action 경계에서 함께 파생돼야 한다.
- Decision Outcome: 공개 UI API는 `PostActionBar` 하나로 제한한다. 현재 공개 경계는 actual Post fragment ref를 받는 `post`, `reply`, `reaction`, `bookmark`, `more`의 명시적 optional config와 Repost error callback을 사용하고 action 순서를 고정한다. 구현된 Repost는 `post` composite fragment 아래 private child action으로 조립하며 반복되는 action control과 child action은 비공개 구현으로만 둔다. Repost의 최종 disabled 행동을 연결할 concrete host input 또는 fragment shape는 actual production caller와 함께 PROD-432가 설계한다.
- Alternatives Considered: 기존 `repost` scalar config를 유지하면 함께 변해야 하는 Repost 상태와 mutation identity가 분해되므로 채택하지 않았다. 임의 `actions[]` 배열은 고정 제품 계약에 불필요한 유연성을 추가하고, 독립 공개 Repost leaf는 공개 API를 넓히므로 채택하지 않았다.
- Consequences: 독립 컴포넌트 사용은 지원하지 않는 config나 Post fragment ref를 생략해 액션을 숨길 수 있다. production Post surface는 actual Post fragment ref와 나머지 config로 다섯 액션을 모두 제공하고 Content·Reply Parent·Repost Source 관계 조합, Post Visibility 또는 권한상 실행할 수 없는 액션을 disabled로 표현한다. concrete Repost policy seam은 PROD-432가 실제 caller와 함께 확정하며 새로운 액션이나 순서 변경은 제품 계약과 OpenSpec 변경을 요구한다.
- Confirmation / Follow-up: PROD-433의 공개 export와 Storybook에서 단일 공개 컴포넌트, 고정 순서 및 optional 표시를 검증하고, PROD-414는 actual Post fragment ref가 private Repost child까지 전달되는지 검증한다. PROD-432는 actual surface에서 Repost disabled seam과 최종 policy 행동을 통합 검증한다.

### 구현된 action은 composite parent fragment와 private child로 조립한다

- Decision Date: 2026-07-26
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-414`, `PROD-432`, `PROD-433`
- Status: Superseded
- Context / Problem: Repost의 선택 상태, 접근성 label, 정확한 delete identity와 create/delete mutation 선택은 같은 `viewerRepost` 관계에서 파생된다. 이를 독립 scalar config로 전달하면 함께 바뀌어야 하는 값을 유효하지 않은 조합으로 만들 수 있다.
- Decision Outcome: `PostActionBar` toolbar는 `PostActionBar_post` composite fragment와 고정 action 순서를 소유한다. private `RepostAction`은 `RepostAction_post` child fragment, create/delete mutation, pending, actor 격리와 파생 도메인 상태를 소유하고 공통 private control을 렌더한다. 현재 surface는 actual Post fragment ref와 error callback을 공급한다. 대상 적격성·현재 실행 주체 권한·guest 인증 위임에서 파생할 최종 disabled 행동은 유지하되, 이를 child에 연결할 concrete host input 또는 fragment shape는 actual production caller와 함께 PROD-432가 설계하고 통합 검증한다. Toolbar container는 child mutation payload나 cache update 정책을 재구현하지 않는다. 아직 구현되지 않은 Reply·Reaction·Bookmark child 전환은 각 선행 action과 PROD-432에 남긴다.
- Alternatives Considered: `useRepostAction`이 `PostActionBar.repost` scalar config를 반환하는 방식은 Relay 관계에서 함께 변하는 상태와 mutation identity를 분해하므로 채택하지 않았다. 독립 공개 Repost leaf는 단일 공개 UI 경계를 넓히므로 채택하지 않았다. Toolbar container가 모든 action mutation과 정책을 직접 소유하는 방식은 surface·action 소유권을 결합하므로 채택하지 않았다.
- Consequences: production query와 Storybook operation은 parent fragment spread를 통해 필요한 Repost fields를 transitively 포함한다. Repost child는 fragment와 mutation을 함께 검증할 수 있지만 production full-bar 조립, 대상 정책·guest 인증 위임과 오류 toast는 계속 PROD-432가 소유한다.
- Confirmation / Follow-up: PROD-414에서 actual parent→child fragment ref, create/delete ID, pending·actor 격리, 생성 cache와 취소 cache 비변경을 검증하고, 이후 action child는 각 선행 계약이 준비됐을 때 같은 원칙을 적용한다.

### Repost child와 최초 production surface를 하나의 전달 slice로 조립한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-414`, `PROD-432`, `PROD-433`
- Status: Active
- Context / Problem: Repost child를 Storybook에만 연결하고 production 배치·menu·오류 안내를 최종 통합 이슈까지 미루면 PROD-414는 사용자가 실제 목록·상세에서 사용할 수 없는 slice로 남는다. 순수 Repost surface가 바깥 Repost fragment를 Action Bar target으로 사용하면 Content 없는 Repost를 다시 Repost하는 잘못된 target도 만든다.
- Decision Outcome: 공개 UI API는 `PostActionBar` 하나로 유지하고 private `RepostAction`이 child fragment·mutation·pending·actor 격리와 파생 상태를 소유한다. PROD-414는 `PostLayout`에는 Action Bar를, `PostListItem`에는 Action Bar를 담은 목록 전용 slot을 content grid의 마지막 sibling이자 모든 navigation link 밖에 렌더링하며, 일반 Post·Quote는 자신을, 순수 Repost는 화면에 표시한 direct Source fragment를 Action Bar target으로 공급한다. Repost trigger는 항상 action menu를 열고 항목 선택 뒤 mutation을 시작하며 PROD-414 surface가 action별 실패 toast를 제공한다. 나머지 action 조립, concrete disabled seam, 대상·세션 정책과 전체 통합은 PROD-432에 남긴다.
- Alternatives Considered: Storybook-only Repost child, PROD-434의 별도 layout seam, PROD-432까지 모든 production 연결 연기, 순수 Repost 바깥 identity target. 각각 실제 사용자 결과를 늦추거나 canceled ownership을 되살리고 잘못된 action target을 만드므로 채택하지 않았다.
- Consequences: production query는 parent fragment spread를 통해 Repost fields를 포함하고 순수 Repost에서는 Source fragment도 Action Bar에 전달해야 한다. `PostList`, route 또는 `actionBar?: ReactNode`가 조립 책임을 갖지 않는다.
- Confirmation / Follow-up: PROD-414에서 actual parent→child와 Source target, final sibling·link 비중첩, menu·toast를 검증하고 PROD-432에서 최종 policy와 전체 action 조합을 검증한다.

### Repost menu와 toast는 최소 공용 platform 경계로 제공한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-action-bar.md`, `PROD-414`, `PROD-431`
- Status: Active
- Context / Problem: Repost trigger의 즉시 mutation은 미래 Quote action과 공유할 진입점을 제공하지 못하고, row별 toast나 하나의 Web/Native popup 구현은 수명·positioning·접근성 책임을 action 상태와 결합한다.
- Decision Outcome: Repost trigger는 선택 여부와 관계없이 menu를 열고 미선택이면 `재게시하기`, 선택됐으면 `재게시 취소` 항목 하나를 표시한다. `인용하기`는 PROD-431 전까지 노출하지 않는다. Web은 anchored popup, Android·iOS는 bottom action sheet를 사용한다. 새 외부 dependency 없이 공용 항목·open·dismiss·선택 결과 경계와 platform 구현을 조립한다. 앱 provider에는 단일 transient toast host를 두고 PROD-414 surface가 생성 실패 `재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.`, 취소 실패 `재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.`를 연결한다. toast는 safe area와 고정 탭 바 위 하단에 약 3초 동안 표시하고 latest-replace·alert semantics를 제공하며 close·retry control과 success toast는 두지 않는다.
- Alternatives Considered: 즉시 mutation 유지, 선택 상태에서만 즉시 취소, 모든 플랫폼의 중앙 Modal, row별 toast, 새 menu/toast package. 각각 미래 항목 확장을 막거나 interaction을 비대칭으로 만들고, 승인된 platform 동작·단일 feedback 수명·dependency 경계를 위반하므로 채택하지 않았다.
- Consequences: private Repost child는 fragment·mutation·pending을 유지하고 menu는 항목 선택 결과만 action에 전달한다. toast host는 후속 action이 재사용할 수 있는 좁은 message API만 제공하며 queue·persistent notification을 미리 구현하지 않는다.
- Confirmation / Follow-up: Web outside/Escape/focus return·keyboard navigation, Native backdrop/back/dismiss/safe area, menu label·pending, toast latest-replace·자동 dismiss·alert semantics와 실패 뒤 상태 유지·재시도를 검증한다.

### Web Repost menu는 같은 pointer 위치를 이어받는 downward overlay로 배치한다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-action-bar.md`, `PROD-414`, 2026-07-29 KST 사용자 결정
- Status: Active
- Context / Problem: trigger 아래의 absolute menu는 Home·Bookmark scroll container와 viewport 하단에서 잘리고, trigger와 첫 item이 떨어져 있어 사용자가 Repost를 확정하려면 포인터를 다시 찾아 이동해야 한다. 기존 menu의 단순 border surface와 text-only item도 Action Bar 위에 떠 있는 action이라는 시각 계층이 약하다.
- Decision Outcome: Web menu는 새 외부 dependency 없이 scroll container 밖의 overlay layer에 렌더링한다. 첫 action item target이 trigger pointer 지점을 덮고 그 item부터 아래 방향으로 menu가 펼쳐지게 배치해, 첫 pointer 입력은 menu만 열고 포인터를 움직이지 않은 두 번째 입력이 실제 item을 선택하게 한다. viewport 가장자리에서는 overlay 좌표를 화면 안으로 보정한다. item은 theme card surface(light theme에서는 흰색), 4px card padding, 36px 높이, 128px 최소폭, 8px 좌우 padding, 18px Repost icon, 14px·500 label, 1px menu border와 `0 2px 4px` shadow를 사용한다. Trigger 자체가 mutation을 직접 실행하는 경계와 최소 44px item을 유지하는 Native bottom action sheet는 바꾸지 않는다.
- Alternatives Considered: 기존 relative subtree에서 아래에만 여는 방식은 clipping과 포인터 이동을 남겨 채택하지 않았다. 위 방향 고정 menu는 같은 위치 연속 입력 UX와 맞지 않아 채택하지 않았다. Radix/Floating UI 같은 새 dependency는 단일 item의 현재 범위에 과하므로 채택하지 않았다.
- Consequences: portal menu를 trigger control과 함께 내부 interaction 영역으로 취급해야 하며 scroll·resize에서 좌표를 다시 계산해야 한다. 현재 `인용하기`는 계속 미노출이고, 미래 다중 item의 세부 collision 정책은 PROD-431이 실제 항목을 추가할 때 재검토한다.
- Confirmation / Follow-up: Storybook에서 첫 item이 trigger corner·center pointer를 포함하는 geometry, 같은 위치의 두 번째 pointer 선택, viewport clamp, scroll container 비클리핑, card surface·36px 높이·128px 최소폭·18px icon·14px·500 label·8px 좌우 padding·border·`0 2px 4px` shadow와 기존 outside/Escape/focus/keyboard 계약을 검증한다.

### 선택 상태와 처리 상태의 분리

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-433`, `PROD-414`, `PROD-417`, `PROD-418`, `PROD-420`, `PROD-425`
- Status: Superseded
- Context / Problem: selected를 pending·disabled·error와 같은 단일 상태 값으로 모델링하면 selected 액션이 요청 중일 때 선택 의미를 잃고 조합 상태를 표현할 수 없다. 반대로 Reply처럼 지속적인 선택 의미가 없는 액션까지 selected를 강제하면 작성 이력이나 composer 열림을 임의의 선택 상태로 해석하게 된다. More의 누름이나 팝업 열림도 지속적인 의미적 선택 상태가 아니다.
- Decision Outcome: Repost·Bookmark와 PROD-417·PROD-418의 공개 계약이 selected 의미를 제공한 Reaction만 `selected`를 처리 상태(default·pending·disabled·error)와 독립적으로 유지한다. Reply는 selected를 받지 않는다. 처리 상태의 시각 표현은 selected의 primary 표현보다 우선한다. pending은 icon을 spinner로 바꾸고 입력을 차단하며, disabled는 비활성 표현으로 입력을 차단하고, error는 danger 표현으로 재시도 입력을 허용한다. 세 조합 모두 지원 액션의 selected 의미와 접근성 상태를 보존한다. More는 count·selected·처리 상태 없이 callback과 접근성 label만 받는다.
- Alternatives Considered: 하나의 상태 enum에 selected·pending·disabled·error를 모두 넣는 방식은 조합 수가 늘고 selected+pending을 자연스럽게 표현하지 못하므로 채택하지 않았다. pending 동안 selected를 숨기는 방식은 실제 viewer-relative 상태를 왜곡하므로 채택하지 않았다.
- Consequences: 상위 계층은 selected를 지원하는 액션의 선택 여부와 모든 액션의 요청 처리 상태를 별도로 공급한다. Reply config에는 selected가 없고, component test와 통합 테스트는 selected 지원 액션의 selected+pending·selected+disabled·selected+error 조합을 검증한다.
- Confirmation / Follow-up: Storybook과 component test에서 세 조합의 시각 우선순위, callback 허용 여부 및 접근성 selected와 처리 상태를 함께 검증한다.

### Reply Composer actual surface 연결은 PROD-425가 소유한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/reply-composer.md`, `PROD-425`, `PROD-432`
- Status: Active
- Context / Problem: 기존 기록은 PROD-432가 Reply를 포함한 나머지 config action을 actual surface에 연결한다고 넓게 표현했지만, 최신 PROD-425는 actual 목록·상세의 Reply callback, controlled `expanded`, selected Profile fragment와 connection 반영을 자기 완료 조건으로 명시한다.
- Decision Outcome: PROD-425는 PROD-414 surface의 Reply config를 기존 Composer와 연결하고 목록 modal·전체 화면, 상세 행별 inline surface와 controlled `expanded`를 제공한다. display Post와 Action Bar target을 분리해 순수 Repost의 Repost Source target을 유지하면서 Reply는 바깥 contentless Repost identity에서 disabled로 차단한다. selected Profile이 없는 guest에는 PROD-425에서 Reply config를 새로 노출하지 않는다. PROD-432는 Reply 연결을 재구현하지 않고 guest 인증 위임, 최종 eligibility·권한과 전체 action 조합에서 회귀 검증한다.
- Alternatives Considered: Reply actual surface를 PROD-432까지 미루면 PROD-425의 최신 완료 조건과 목록·상세 디자인 계약을 충족하지 못한다. PROD-425가 guest 인증 위임까지 구현하면 PROD-432의 최종 surface 정책을 선점한다.
- Consequences: `PostListItem`, `PostLayout`, `PostDetailThread`와 route의 Reply surface 변경은 PROD-425 PR에 포함된다. PROD-432 task는 완료된 Reply 결과를 소비하는 문장으로 유지한다.
- Confirmation / Follow-up: PROD-425에서 actual surface와 Composer callback을 검증하고, PROD-432에서 guest와 다른 action을 포함한 최종 조합을 검증한다.

### More 컴포넌트 경계와 링크 복사 통합을 분리

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-432`, `PROD-433`
- Status: Superseded
- Context / Problem: More는 현재 링크 복사 하나만 필요하지만 공통 Action Bar가 팝업·clipboard·플랫폼별 메뉴 상태까지 소유하면 UI 컴포넌트와 production surface 책임이 결합된다.
- Decision Outcome: `PostActionBar`는 optional More icon, callback과 접근성 label만 제공한다. PROD-432의 production surface 통합은 callback으로 접근 가능한 최소 팝업을 열고 `링크 복사` 한 항목을 제공한다. 공유 URL은 기존 `/{relativeHandle}/{postId}` route를 canonical web origin에 결합한 query·hash 없는 절대 URL이며, Web은 현재 browser origin, Android·iOS는 검증된 `EXPO_PUBLIC_WEB_ORIGIN`을 사용한다. API origin이나 native deep link는 사용하지 않고 guest도 링크 복사를 인증 없이 사용할 수 있다.
- Alternatives Considered: More를 완전히 생략하면 production 계약을 다시 변경해야 하므로 채택하지 않았다. 공통 컴포넌트가 팝업과 clipboard를 직접 소유하는 방식은 surface 통합 책임을 침범하므로 채택하지 않았다. 여러 메뉴 항목을 미리 추가하는 방식은 승인된 범위를 넘으므로 채택하지 않았다.
- Consequences: PROD-433은 More의 표시·접근성·callback만 검증하고, PROD-432가 팝업·링크 복사와 guest 동작을 통합 검증한다. 링크 복사 외 메뉴 항목은 후속 제품 계약을 요구한다.
- Confirmation / Follow-up: PROD-433 component test와 PROD-432 integration test의 검증 책임을 분리한다.

### canonical 문서·Linear·OpenSpec·Figma의 source hierarchy

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `memory/issue-openspec-workflow.md`, `PROD-432`
- Status: Active
- Context / Problem: 현재 Figma에는 pending·disabled와 접근 가능한 실패 toast가 없고, 도구를 통한 수정 결과를 신뢰할 수 있는 동기화 기준으로 삼기 어렵다. 동시에 Figma의 27px 측정값을 production 정수 geometry로 정규화하고 제품 정책과 작업 범위, 규범적 UI 계약의 소유권을 구분해야 한다.
- Decision Outcome: `docs/domain`·`docs/design`은 제품·디자인의 canonical source, Linear는 범위·소유권·의존성의 source, 이 OpenSpec은 상태·입력·접근성·통합 동작의 규범 계약으로 사용한다. Figma Action node는 배치·간격·icon·색상의 비규범적 시각 참고로만 사용하며 이 change에서 수정하지 않는다.
- Alternatives Considered: 구현 전에 Figma variant와 touch target 설명을 추가하는 방식은 도구 반영 신뢰도가 낮고 사용자가 필요할 때 직접 정렬하기로 했으므로 채택하지 않았다. Figma에 없는 상태와 실패 피드백을 구현하지 않는 방식은 Linear와 OpenSpec의 승인된 완료 조건을 위반하므로 채택하지 않았다.
- Consequences: 일정 기간 Figma와 구현 상태 카탈로그 사이의 차이를 허용한다. 향후 Figma를 정렬할 때 canonical 문서·Linear·OpenSpec·코드의 소유 경계를 기준으로 역동기화해야 한다.
- Confirmation / Follow-up: OpenSpec strict validation과 구현 PR 검토에서 Linear·OpenSpec·코드 정합성을 확인한다. Figma 수정은 이 change의 task에 포함하지 않는다.

### 액션별 광학 크기와 선 두께를 조정

- Decision Date: 2026-07-23
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-433`, 2026-07-23 KST 사용자 결정
- Status: Superseded
- Context / Problem: 같은 16px과 Lucide 기본 `strokeWidth` 2를 사용하면 내부 여백이 큰 Repost는 다른 glyph보다 작고 가늘게 보이고, Reply는 count보다 크게 느껴지며 수직 중심이 어긋나 보인다. Reaction Heart도 상대적으로 작고 모든 action glyph의 선 가독성이 부족하다.
- Decision Outcome: Reply는 16px slot 중앙의 14px glyph, Repost는 20px glyph, Reaction Heart는 18px glyph, Bookmark·More는 16px glyph를 사용한다. Reply·Reaction·Bookmark·More의 Lucide `strokeWidth`는 3.5, 추가 강조가 필요한 Repost는 4를 사용한다. active Heart·Bookmark의 fill은 유지한다. pending spinner는 14px을 각 액션의 default glyph slot 중앙에 배치하고, 모든 control은 최소 44×44 interactive target을 유지한다.
- Alternatives Considered: 모든 glyph를 16px과 기본 선 두께로 유지하는 방식은 확인된 광학 불균형과 가독성 문제를 남겨 채택하지 않았다. 모든 glyph를 같은 크기로 일괄 확대·축소하는 방식은 이미 적절한 Bookmark·More까지 바꾸므로 채택하지 않았다. Reply나 Repost를 한 축으로만 늘리는 방식은 Lucide 비율을 왜곡하므로 채택하지 않았다.
- Consequences: action별 visual glyph와 slot 폭이 달라지지만 공개 props, 순서, 최소 입력 영역과 접근성 계약은 바뀌지 않는다. Repost의 default↔pending 전환은 20px slot을 유지하고 다른 action도 자기 slot 중앙에서 spinner를 표시하므로 count와 행 배치가 흔들리지 않는다.
- Confirmation / Follow-up: PROD-433 Storybook에서 다섯 glyph의 크기와 선 두께, Reply·Repost의 count 중앙선, pending slot과 390px·900px·1400px 한 행 배치를 검증한다.

### Reply·Repost의 실제 획 높이를 count와 맞춘다

- Decision Date: 2026-07-23
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-433`, 2026-07-23 KST 사용자 결정
- Status: Superseded
- Context / Problem: Reply·Repost의 SVG element box와 16px count line box 중심을 같게 배치해도 실제 icon path와 글자 획의 높이가 달라 수평선이 맞지 않아 보인다. 특히 Repeat2를 20×20px과 `strokeWidth` 4로 균등 확대하면 원래 y=6~18만 사용하는 가로형 path는 계속 눌려 보이면서 선만 과도하게 두꺼워진다. 비정사각 scaling 뒤에도 SUIT count의 font ink가 icon optical center보다 높게 느껴진다. 14×16 Reply와 16×24 Repost는 세로 대비 가로가 부족해 과도하게 길어 보인다.
- Decision Outcome: Reply는 16×16px slot 중앙의 16×16px glyph, Repost는 18×24px slot의 18×24px glyph를 사용한다. Reply·Reaction·Bookmark·More의 `strokeWidth`는 3.5를 유지하고, 가로 path가 과도하게 무거워 보이지 않도록 Repost만 2.7을 사용한다. Reply는 가로폭을 16px로 넓혀 세로와 같은 비율로 맞춘다. Repost는 24×24 viewBox의 y=6~18 path가 실제 약 16px 높이로 보이도록 세로 24px을 유지하고, 가로폭은 18px로 넓혀 세로로 과도하게 늘어난 비율을 완화한다. React Native SVG의 기본 비율 보존이 비정사각 viewport 안에 정사각 content를 letterbox하지 않도록 Reply·Repost에만 `preserveAspectRatio="none"`을 전달한다. count는 모든 ActionControl에서 lineHeight와 layout 위치를 바꾸지 않고 내부 typography transform으로 시각적으로 2px 아래에 둔다. pending spinner는 14px 크기와 각 액션 slot layout을 유지한 채 시각만 1px 아래로 이동해 count 중심보다 1px 위에 둔다. Reaction Heart 18×18px, Bookmark·More 16×16px, active fill과 최소 44×44 interactive target은 유지한다.
- Alternatives Considered: Repost 20×20px과 `strokeWidth` 4는 path 비율을 개선하지 못하고 선만 과도하게 두꺼워 채택하지 않았다. Repost 16×20px은 path가 사용하는 세로 영역이 실제 약 10px로 남아 16px count 획 높이와 계속 차이가 나므로 채택하지 않았다. 비정사각 width·height만 전달하고 기본 `preserveAspectRatio="xMidYMid meet"`를 유지하는 방식은 정사각 content를 letterbox해 실제 path 비율을 바꾸지 못하므로 채택하지 않았다. count lineHeight나 layout 위치를 바꾸는 방식은 Reply·Repost 이외의 typography와 플랫폼별 font metric까지 넓게 바꾸므로 채택하지 않았다. action별 icon `translateY`는 spinner slot과 default glyph 중심 계약을 바꾸므로 채택하지 않았다.
- Consequences: 내부 icon renderer가 width와 height를 별도로 처리하지만 공개 `PostActionBarProps`, 액션 순서, count 계약, 입력·접근성 상태는 바뀌지 않는다. Reply·Repost의 default와 pending slot은 각각 16×16px·18×24px로 유지하므로 icon↔spinner 전환 때 행 배치가 흔들리지 않는다. Repost glyph와 slot 폭을 같게 해 Android View clipping을 피하고 플랫폼별로 같은 18px glyph를 보장한다. count는 렌더링만 2px 내려가며 lineHeight와 action target은 유지하고, pending spinner만 렌더링 1px 내려간다.
- Confirmation / Follow-up: PROD-433 Storybook에서 Reply 16×16px, Repost 18×24px와 `strokeWidth` 2.7, 나머지 glyph의 `strokeWidth` 3.5, Reply·Repost count의 icon 중심보다 2px 낮은 렌더 위치와 pending spinner의 count 중심보다 1px 높은 렌더 위치, 실제 광학 정렬과 390px·900px·1400px 한 행 배치를 검증한다.

### Figma 기반 28px geometry로 Action Bar를 정규화한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, `docs/design/post-action-bar.md`, `PROD-414`, 2026-07-29 KST 사용자 결정
- Status: Active
- Context / Problem: 기존 44px control과 action별 16~24px glyph 보정은 Figma의 약 27px row보다 지나치게 높고 아이콘 비율도 제각각이라 production Post에서 시각 밀도가 무너진다. Web이 현재 출시 범위이고 Native binary는 아직 출시 범위가 아니므로 먼저 공유 구현을 Figma geometry에 맞출 필요가 있다.
- Decision Outcome: Figma의 약 27px 측정값을 production 정수값 28px로 정규화한다. Bar와 모든 control은 Android·iOS·Web에서 높이 28을 사용하고 Bar는 좌우 8 padding 안에서 action을 `space-between`으로 분배한다. Reply·Repost·Reaction·Bookmark target은 각각 너비 50, More target은 최소 너비 28이며 모든 glyph visual box는 16×16, icon-count 간격은 4, count line box는 16이다. pending spinner, selected·pressed·disabled 표현도 같은 28px slot을 유지한다. Web target은 24×24 CSS px 사각형을 포함하고 인접 target과 겹치지 않는다.
- Alternatives Considered: 기존 44px control 유지는 Figma와 production 밀도 차이를 남겨 채택하지 않았다. Web만 28px로 바꾸고 Native를 즉시 44pt·48dp로 분기하면 아직 출시하지 않는 platform에서 공유 구현 drift가 생겨 채택하지 않았다. visual row만 28px로 줄이고 겹치는 hit slop으로 Native target을 확장하면 인접 action target과 focus boundary가 겹칠 수 있어 채택하지 않았다.
- Consequences: 이전 action별 비정사각 glyph와 optical transform을 제거하고 fixed geometry로 단순화한다. Native 28pt·28dp는 Apple·Android baseline을 충족하지 않는 출시 전 임시 예외이므로 Native 접근성 완료를 주장하지 않는다.
- Confirmation / Follow-up: Storybook에서 exact geometry와 Web target non-overlap을 검증한다. iOS 출시 전 최소 44×44pt, Android 출시 전 최소 48×48dp를 복구하고 touch·VoiceOver·TalkBack runtime을 별도 검증한다.

### 목록 Post 카드의 Action Bar 주변 spacing을 Figma에 맞춘다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, `docs/design/post-action-bar.md`, `PROD-414`, 2026-07-29 KST 사용자 결정
- Status: Superseded
- Context / Problem: `PostListItem`의 기존 큰 하단 padding은 제거했지만 Action Bar와 카드 구분선이 바로 붙어 답답하고, 공용 `border`는 입력·메뉴 외곽선까지 함께 사용되어 Post divider만 옅게 만들 수 없다.
- Decision Outcome: 일반 Post·Quote·순수 Repost 목록에서 Action Bar 자체 28px은 유지하고 목록 전용 slot의 상단 padding은 0, 하단 padding은 `spacing.xs` 4px로 둔다. Quote만 nested Source preview border 아래부터 Action Bar까지 4px 간격을 추가하며 일반 Post와 순수 Repost의 상단 간격은 늘리지 않는다. 카드 구분선은 1px을 유지하며 light `#f2f2f2`, dark `#292929`의 semantic `divider` token을 사용한다. 순수 Repost attribution은 20px line box와 Source 표준행까지 gap 0을 사용한다. Web Profile text link는 inline target 예외를 적용하고 Native target 복구와 인접 target runtime 검증은 출시 gate로 남긴다.
- Consequences: `PostListItem` spacing과 Post divider color만 변경하며 공용 `border`, `PostLayout`, Action Bar 28px geometry와 action 동작은 유지한다.
- Confirmation / Follow-up: 390px Web Storybook에서 세 목록 variant의 상단 0px·하단 4px, Quote preview 아래 4px, 1px divider color와 순수 Repost attribution 높이·Source gap을 exact 값으로 검증한다.

### Quote preview 내부·외부 spacing을 분리한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-action-bar.md`, `PROD-414`, 2026-07-29 KST 사용자 결정
- Status: Active
- Context / Problem: Quote Source preview의 공통 12px 하단 padding과 border 밖 4px 간격을 함께 사용하면 실제로 늘어난 공간이 border 내부에만 있는 것처럼 보이고, text-only Post보다 Action Bar 주변이 답답하게 느껴진다.
- Decision Outcome: 일반 Post·Quote·순수 Repost 목록에서 Action Bar 자체 28px과 목록 final slot의 상단 padding 0·하단 padding 4px을 유지한다. Quote 목록에서만 nested Source preview 내부 하단 padding을 `spacing.xs` 4px로 줄이고, Source preview border 밖에서 Action Bar까지 `spacing.sm` 8px 간격을 둔다. 일반 Post·순수 Repost와 상세의 Source preview spacing은 바꾸지 않는다. 카드 구분선 1px semantic `divider`, 순수 Repost attribution 20px line box·Source gap 0과 Native 출시 gate도 유지한다.
- Alternatives Considered: Quote preview 내부 12px을 유지한 채 외부 간격만 8px로 늘리면 내부 공백이 더 강하게 보여 의도한 경계가 드러나지 않아 채택하지 않았다. 공용 Action Bar slot의 상단 간격을 늘리면 text-only Post와 순수 Repost까지 불필요하게 높아져 채택하지 않았다. Action Bar를 Post 카드 구분선 밖으로 이동하면 content grid의 final sibling 계약을 깨므로 채택하지 않았다.
- Consequences: Quote 목록 caller만 Source preview style을 전달하며 다른 `PostSourcePresentationView`와 상세 `PostSourcePreview`의 기본 12px padding은 유지된다. Quote 카드 전체 높이는 내부에서 8px 줄고 외부에서 4px 늘어 이전보다 4px 낮아진다.
- Confirmation / Follow-up: focused Storybook interaction과 390px Web runtime에서 Source body부터 border 안쪽까지 4px, border 밖에서 Action Bar까지 8px, Action Bar 28px과 하단 4px을 각각 exact geometry로 검증한다.

### 공유 change와 부모 소유의 최종 archive

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `memory/issue-openspec-workflow.md`, `PROD-432`, `PROD-433`, `PROD-434`
- Status: Active
- Context / Problem: UI 컴포넌트, surface 배치와 실제 action 연결은 별도 PR로 리뷰해야 하지만 하나의 최종 Post Action Bar 결과와 통합 검증을 공유한다.
- Decision Outcome: `add-post-action-bar` 하나가 PROD-432 계약 전체를 소유한다. PROD-433과 PROD-434는 자기 구현과 테스트를 소유하고, PROD-432는 선행 action 연결, 전체 surface 통합 검증, task 정합성 확인과 최종 archive를 소유한다.
- Alternatives Considered: 구현 자식마다 OpenSpec을 복제하면 같은 상태·접근성·배치 계약이 갈라지고 부분 완료를 전체 완료로 오인할 수 있어 채택하지 않았다. 부모를 추적 컨테이너로만 두는 방식은 최종 통합 검증과 archive 소유자가 사라져 채택하지 않았다.
- Consequences: 개별 구현 PR이 완료되어도 공유 change를 부분 archive하지 않는다. 모든 자식과 선행 action이 완료되고 부모 통합 검증이 통과할 때까지 active 상태를 유지한다.
- Confirmation / Follow-up: `tasks.md`를 구현 이슈별로 나누고 PROD-432 마지막 group에 통합 검증과 archive를 둔다.

### count는 K/M 단위 최대 네 글자로 표시

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-432`, `PROD-433`
- Status: Superseded
- Context / Problem: 원본 count 길이를 제한하지 않으면 compact 폭에서 다섯 액션, 16px icon/count와 44×44 target을 한 행으로 유지하는 요구사항을 검증할 수 없다.
- Decision Outcome: 0~999는 원문, 1,000 이상은 K, 1,000,000 이상은 M 단위를 사용한다. 단위 값이 10 미만일 때만 소수 한 자리를 반올림하고 `.0`은 생략하며, 그 이상은 정수로 반올림한다. K 반올림 결과가 1,000K면 M으로 승격하고, M 반올림 결과가 1,000M에 도달하거나 원본 count가 10억 이상이면 `999M`으로 상한 표시해 최대 네 글자를 유지한다.
- Alternatives Considered: 무제한 원본 숫자는 compact layout 계약과 충돌하므로 채택하지 않았다. locale별 장문 표기와 B 단위는 현재 필요하지 않고 폭 계약을 넓히므로 채택하지 않았다.
- Consequences: count의 정확한 원본 값과 집계 의미는 선행 action 계약이 소유하고, Action Bar는 동일한 compact 표시 규칙만 소유한다.
- Confirmation / Follow-up: 999, 1,000, 1,234, 9,999, 999,999, 1,000,000과 1,000,000,000 경계를 component test에서 검증한다.

### 공개 도메인 상태와 처리 상태를 분리

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-432`, `PROD-433`, `PROD-414`, `PROD-417`, `PROD-418`, `PROD-420`, `PROD-425`
- Status: Superseded
- Context / Problem: 범용 `selected`는 Reply Composer의 열림, Repost 수행 여부, 하나 이상의 Reaction 존재와 Bookmark 여부처럼 서로 다른 제품 의미를 하나의 이름으로 축약해 상위 adapter와 컴포넌트 계약을 모호하게 만든다.
- Decision Outcome: 공개 UI 상태는 Reply의 controlled `expanded`, Repost의 `hasReposted`, Reaction의 `hasReacted`, Bookmark의 `hasBookmarked`로 표현하고 default·pending·disabled·error 처리 상태와 독립적으로 유지한다. Reply 활성화는 상위 Composer를 열거나 focus할 뿐 `expanded`를 자체 전환하지 않는다. Reaction은 현재 Profile이 하나 이상의 Reaction Type을 남겼는지만 `hasReacted`로 나타내며 Reaction과 Bookmark는 count를 받지 않는다. `hasReacted` 또는 `hasBookmarked`가 true이면 pending spinner를 제외한 Heart·Bookmark 내부를 현재 처리 상태 색상으로 채우고 default에서는 primary 색상을 사용한다. More는 callback과 접근성 label만 받는다.
- Alternatives Considered: 범용 `selected`는 도메인 의미와 소유 계층을 숨기므로 채택하지 않았다. Reply가 내부 상태로 Composer 열림을 전환하는 방식은 controlled surface 계약과 충돌하므로 채택하지 않았다.
- Consequences: surface adapter가 도메인별 값을 공급하고, 처리 상태의 시각 표현이 primary 표현보다 우선해도 도메인 의미, Reaction·Bookmark의 채워진 형태와 접근성 상태는 보존한다. React Native 접근성 구현 내부에서는 플랫폼의 `selected`·`pressed`·`expanded` 용어를 사용할 수 있다.
- Confirmation / Follow-up: Storybook과 component test에서 `expanded`·`hasReposted`·`hasReacted`·`hasBookmarked`와 pending·disabled·error의 조합, active Reaction·Bookmark의 채워진 형태, callback 허용 여부 및 접근성 상태를 검증한다.

### 공개 도메인 상태와 일시적 실패 피드백을 분리

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-432`, `PROD-433` Linear comment `2abceb83-7f74-4fb3-a436-145dde45195c`, `PROD-414`, `PROD-417`, `PROD-418`, `PROD-420`, `PROD-425`
- Status: Superseded
- Context / Problem: `expanded`·`hasReposted`·`hasReacted`·`hasBookmarked`는 현재 확정된 제품 상태이지만, 마지막 요청 실패는 일시적 실행 결과다. 실패를 Action Bar의 지속 `error`·danger 상태로 남기면 현재 도메인 상태와 위험·파괴적 의미로 읽힐 수 있는 실패 표현이 하나의 control에 섞인다.
- Decision Outcome: 공개 UI 상태는 Reply의 controlled `expanded`, Reaction의 `hasReacted`, Bookmark의 `hasBookmarked`로 표현하고 default·pending·disabled 처리 상태와 독립적으로 유지한다. Repost child는 fragment의 `viewerRepost`에서 `hasReposted`를 파생하고 자기 mutation pending과 독립적으로 유지한다. Reaction과 Bookmark는 count를 받지 않고 active이면 pending spinner를 제외한 현재 처리 상태 색상으로 icon 내부를 채운다. 요청 실패 시 child action 또는 production surface는 pending을 종료하고 직전의 확정된 도메인 상태와 count를 유지한 채 default로 복귀한다. child action은 error callback을 호출하고 PROD-432는 액션별 한국어 toast와 동일한 보조 기술 안내를 제공한다. 별도 retry 상태나 toast 버튼은 두지 않고 같은 액션의 다음 입력을 재시도로 처리한다. `PostActionBar`는 toast를 소유하지 않는다.
- Alternatives Considered: danger `error` 상태만 유지하는 방식은 구현은 단순하지만 일시적 실패와 도메인 상태를 섞고 실패 문구를 제공하지 못해 채택하지 않았다. toast와 danger 상태를 함께 두는 방식은 중복 피드백과 상태 수명 복잡도를 만들어 채택하지 않았다. toast 내 retry 버튼은 같은 액션의 다음 입력이 자연스러운 재시도 경로이므로 추가하지 않았다.
- Consequences: PROD-433은 공개 `error` 처리 상태, danger 표현, 재시도 label·hint와 관련 Storybook·component test를 제거한다. PROD-414 child action은 실제 Repost mutation 실패에서 이전 확정 상태와 cache를 유지하고 error callback·다음 입력 재시도를 검증한다. PROD-432는 접근 가능한 toast를 production surface에서 통합 검증한다. cross-platform toast primitive·package 선택은 PROD-432 구현 계획에서 별도로 결정한다.
- Confirmation / Follow-up: PROD-433 Storybook과 component test는 config 기반 Reply·Reaction·Bookmark의 default·pending·disabled와 Repost child의 fragment-derived `hasReposted`·default·mutation pending을 검증한다. PROD-432는 actual surface에서 Repost policy-disabled 시각·입력 차단·접근성 상태, Web·Android·iOS의 액션별 toast, 보조 기술 즉시 안내, 이전 확정 상태 유지와 다음 입력 재시도를 검증한다.

### Repost 실패 피드백은 PROD-414 surface에서 완성한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-action-bar.md`, `PROD-414`, `PROD-432`
- Status: Active
- Context / Problem: 일시적 실패를 지속 error 상태와 분리하는 기존 결정은 유효하지만, Repost toast를 PROD-432까지 미루면 PROD-414의 production action이 실패 이유를 사용자에게 제공하지 못한다.
- Decision Outcome: 공개 도메인 상태는 처리 상태와 독립적으로 유지하고 요청 실패 시 pending만 종료한 뒤 직전 서버 확정 상태와 count를 보존한다. private Repost child는 action별 error callback을 호출하고 PROD-414의 actual surface가 정확한 한국어 transient toast와 동일한 alert semantics를 제공한다. light toast는 `#262626` accent 배경을 사용하고 message line box·padding을 유지한 채 glyph만 2px 아래로 이동한다. 별도 retry 상태나 toast 버튼 없이 menu를 다시 열고 같은 항목을 선택해 재시도한다. `PostActionBar` toolbar container는 toast를 소유하지 않는다. Repost 외 action의 실패 표면과 전체 통합은 각 action 계약과 PROD-432가 소유한다.
- Alternatives Considered: PROD-432까지 Repost toast 연기, Action Bar danger 상태, toast 내 retry 버튼. 각각 독립 전달 결과를 불완전하게 만들거나 transient 결과와 domain 상태를 섞고 중복 재시도 UI를 만들므로 채택하지 않았다.
- Consequences: PROD-414는 provider host·surface callback 연결과 Web·Android·iOS 접근성 검증을 추가한다. PROD-432는 이를 재구현하지 않고 전체 action 조합에서 회귀만 확인한다.
- Confirmation / Follow-up: action별 exact copy, latest-replace, 약 3초 dismiss, safe area·tab bar 위치, alert semantics, light `#262626` accent와 message 2px optical shift, 이전 상태 유지와 다음 menu 재시도를 검증한다.

### More callback 경계와 Post Share Reference 통합을 분리

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0015-post-share-reference.md`, `docs/domain/objects/post.md`, `PROD-432`, `PROD-433`
- Status: Active
- Context / Problem: More의 callback-only 컴포넌트 경계와 사용자가 복사할 URL의 제품 정책은 서로 다른 authority와 구현 소유자를 가진다.
- Decision Outcome: `PostActionBar`는 optional More icon, callback과 접근성 label만 제공한다. PROD-432의 production surface 통합은 접근 가능한 최소 팝업과 `링크 복사` 한 항목을 제공하고 ADR 0015의 Post Share Reference를 복사한다. Content가 있는 Post는 그 Post의 공유 참조를 복사한다. Content와 Reply Parent 없이 Repost Source만 있는 Repost는 독립 상세 참조를 노출하지 않고 조회 가능한 직접 Repost Source의 공유 참조를 복사한다. Web·Android·iOS 모두 현재 deployment가 사용하는 configured Local Instance의 `canonical_origin`을 canonical Web origin으로 사용한다. `EXPO_PUBLIC_WEB_ORIGIN`은 이 값을 Expo client에 전달하는 projection이며 독립 authority가 아니다. Web의 현재 browser origin이 달라도 공유 참조에 사용하지 않는다. guest도 조회할 수 있는 Post의 공유 참조를 인증 없이 복사할 수 있지만 링크는 Post Visibility와 Post Eligibility를 우회하지 않는다.
- Alternatives Considered: 공통 컴포넌트가 팝업과 clipboard를 소유하는 방식은 surface 통합 책임을 침범하므로 채택하지 않았다. 현재 화면 URL 전체, API origin과 native deep link는 ADR 0015의 대안 검토에 따라 채택하지 않았다.
- Consequences: PROD-433은 More의 표시·접근성·callback만 검증하고 PROD-432가 팝업·clipboard·platform별 origin 연결과 guest 동작을 통합 검증한다. 링크 복사 외 메뉴 항목은 후속 제품 계약을 요구한다.
- Confirmation / Follow-up: PROD-433 component test와 PROD-432 integration test의 검증 책임을 분리하고, PROD-432는 configured Local Instance의 `canonical_origin`을 기준으로 같은 canonical URL fixture를 platform별로 검증하며 Web의 current Host가 다른 경우와 Content 없는 Repost가 직접 Source의 공유 참조를 복사하는 경우도 확인한다.

### locale-aware 표준 compact number formatting을 사용

- Decision Date: 2026-07-23
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-432`, `PROD-433`
- Status: Active
- Context / Problem: Action Bar가 K/M 반올림·단위 승격·`999M` 상한을 수동 구현하면 JavaScript 표준의 locale-aware compact formatting을 중복하고 한국어의 천·만·억 같은 실행 환경 표기를 막는다.
- Decision Outcome: 선행 action 계약이 Reply config와 Repost child fragment에 제공한 optional count는 실행 환경 locale의 표준 `Intl.NumberFormat` compact notation을 사용한다. Action Bar는 K/M 단위, 반올림 경계, 단위 승격과 표시 상한을 자체 구현하지 않고 locale별 정확한 문자열을 규범으로 고정하지 않는다. Reaction·Bookmark·More는 count를 받지 않으며 count 계약이 없는 Reply·Repost에는 `0`이나 placeholder를 합성하지 않는다.
- Alternatives Considered: 수동 K/M formatter는 표준 기능을 중복하고 locale 출력을 제거하므로 채택하지 않았다. raw count는 좁은 폭에서 길이를 제한하지 못하므로 채택하지 않았다.
- Consequences: locale과 플랫폼의 표준 데이터에 따라 단위와 반올림 결과가 달라질 수 있다. 레이아웃은 최대 네 글자 가정 대신 한국어·영어 대표 compact fixture에서 한 행과 비겹침을 검증한다.
- Confirmation / Follow-up: PROD-433 구현에서 기존 `Intl.NumberFormat` 사용 관례를 재사용하고 Web Storybook과 Android·iOS runtime에서 대표 fixture를 검증한다.

### 실행할 수 없는 액션은 숨기지 않고 disabled로 유지

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/bookmark.md`, `docs/domain/objects/profile.md`, `docs/domain/README.md`, `PROD-432`, `PROD-425`
- Status: Superseded
- Context / Problem: Content·Reply Parent·Repost Source 관계 조합, Post Visibility 또는 권한에 따라 액션을 생략하면 고정 구성의 위치가 흔들리고 사용자가 기능의 존재와 현재 사용할 수 없는 이유를 구분하기 어렵다. 또한 canonical action 계약의 `Account.Active`·`Profile.Member` 같은 현재 세션 전제를 대상 Post의 액션 적격성과 합쳐 사용하면 guest의 인증 진입 callback이 항상 disabled 뒤에 가려진다.
- Decision Outcome: production Post surface는 다섯 액션을 모두 렌더한다. surface adapter는 Content·Reply Parent·Repost Source 관계 조합, Post Visibility와 대상 관련 조건으로 결정되는 대상 적격성과 현재 실행 주체·세션의 실행 권한을 분리한다. 대상 자체가 부적격하거나 인증된 실행 주체가 권한을 갖지 못한 액션은 optional prop을 생략하지 않고 disabled 상태로 제공한다. Content와 Reply Parent가 없고 Repost Source만 있는 Repost는 Reply·Repost를 disabled로 표시하고, Content가 있는 Post는 관계 조합만으로 네 소셜 액션을 차단하지 않는다. guest의 Reply·Repost·Reaction·Bookmark는 `Account.Active`·`Profile.Member`·선택 Profile 부재만으로 숨기거나 비활성화하지 않고, 대상 자체가 적격할 때만 상위 인증 진입 callback으로 위임한다.
- Alternatives Considered: 정책상 불가능한 액션을 숨기는 방식은 고정 구성을 깨므로 채택하지 않았다. guest 액션을 disabled로 두는 방식은 인증·가입 진입점을 제공하지 못하므로 채택하지 않았다.
- Consequences: 실제 대상 적격성과 실행 권한은 canonical 문서와 선행 action 계약이 소유하고 Action Bar는 adapter가 전달한 disabled 상태만 표현한다. guest 인증 목적지·화면 전환·임시 화면은 이 change에서 구현하지 않는다.
- Confirmation / Follow-up: PROD-432 통합 검증에서 Content 없는 Repost와 Visibility 등 대상 자체 제한, 인증된 실행 주체의 권한 제한, 대상이 적격한 guest의 인증 위임과 대상이 부적격한 guest의 disabled 유지를 각각 확인한다.

### production surface는 표시 Post와 action target을 구분한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-414`, `PROD-432`
- Status: Active
- Context / Problem: 순수 Repost는 바깥 Repost Post를 표시 단위로 사용하지만 본문과 action의 실제 대상은 direct Source다. 이를 구분하지 않고 관계 조합만으로 바깥 Repost의 Repost action을 disabled 처리하면 사용자가 화면에 보이는 Source를 action할 수 없다.
- Decision Outcome: production surface는 다섯 액션의 고정 위치를 유지하되 display Post와 각 action target을 구분한다. 일반 Post와 Quote의 Action Bar는 바깥 Post를 target으로 사용하고, 순수 Repost 아래 Action Bar는 direct Source를 target으로 사용한다. target 자체가 부적격하거나 인증된 실행 주체가 권한을 갖지 못한 액션은 숨기지 않고 disabled로 제공한다. guest에게 현재 세션 전제가 없다는 이유만으로 target 자체가 적격한 소셜 action을 disabled로 만들지 않고 상위 인증 진입에 위임한다.
- Alternatives Considered: 순수 Repost의 Repost action을 항상 disabled, 바깥 Repost identity target, 순수 Repost에서 Action Bar 숨김. 모두 display한 Source에 대한 일관된 action 진입점을 잃거나 잘못된 target을 사용하므로 채택하지 않았다.
- Consequences: surface adapter와 fragment는 display Post와 target Post를 구분해 전달해야 하지만 toolbar 공개 API나 고정 순서는 바뀌지 않는다. 최종 eligibility·권한 seam은 PROD-432가 실제 caller와 통합 검증한다.
- Confirmation / Follow-up: 일반·Quote self target, 순수 Repost Source target, disabled·guest 인증 위임과 Action Bar 고정 배치를 각각 검증한다.

### Action Bar 컨테이너는 고정된 한국어 접근성 이름을 사용

- Decision Date: 2026-07-24
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-433`, 사용자 확인
- Status: Active
- Context / Problem: toolbar role만 제공하면 한 화면에 반복되는 Action Bar 컨테이너의 접근 가능한 이름이 비어 있고, 새 공개 prop으로 surface마다 이름을 조립하면 현재 컴포넌트 범위에 불필요한 API가 추가된다.
- Decision Outcome: `PostActionBar` 컨테이너는 고정된 한국어 접근성 이름 `액션 바`와 toolbar role을 제공한다. 컨테이너를 단일 접근성 요소로 만들지 않고 내부 action button의 개별 label과 탐색을 유지한다.
- Alternatives Considered: `accessibilityLabel` 공개 prop을 받는 방식은 surface별 별도 문구 요구가 없어 채택하지 않았다. 영어 이름 `Action bar`는 저장소의 기존 사용자 대상 접근성 문구가 한국어인 관례와 맞지 않아 채택하지 않았다. toolbar 이름을 생략하는 방식은 반복되는 toolbar를 구분할 이름이 없어 채택하지 않았다.
- Consequences: 한 화면의 여러 Post Action Bar가 같은 이름을 사용하지만 모두 toolbar로 식별되며, 각 액션은 기존 label을 가진 button으로 계속 탐색된다. 공개 `PostActionBarProps`는 바뀌지 않는다.
- Confirmation / Follow-up: Storybook에서 반복 렌더된 toolbar를 `액션 바` 이름으로 찾고 각 toolbar 내부 action button이 계속 노출되는지 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-07-21 `고정된 단일 공개 컴포넌트 API`는 2026-07-26 `Post fragment와 private action을 단일 공개 컴포넌트에 조립한다`로 대체했다.
- 2026-07-26 `Post fragment와 private action을 단일 공개 컴포넌트에 조립한다`와 `구현된 action은 composite parent fragment와 private child로 조립한다`는 2026-07-27 `Repost child와 최초 production surface를 하나의 전달 slice로 조립한다`로 대체했다.
- 2026-07-21 `선택 상태와 처리 상태의 분리`는 2026-07-23 `공개 도메인 상태와 처리 상태를 분리`로 대체했다.
- 2026-07-23 `공개 도메인 상태와 처리 상태를 분리`는 2026-07-23 `공개 도메인 상태와 일시적 실패 피드백을 분리`로 대체했다.
- 2026-07-23 `공개 도메인 상태와 일시적 실패 피드백을 분리`는 2026-07-27 `Repost 실패 피드백은 PROD-414 surface에서 완성한다`로 Repost 소유 범위가 대체됐다. Repost 외 action의 원칙은 유지한다.
- 2026-07-21 `More 컴포넌트 경계와 링크 복사 통합을 분리`는 2026-07-23 `More callback 경계와 Post Share Reference 통합을 분리`로 대체했다.
- 2026-07-21 `count는 K/M 단위 최대 네 글자로 표시`는 2026-07-23 `locale-aware 표준 compact number formatting을 사용`으로 대체했다.
- 2026-07-23 `액션별 광학 크기와 선 두께를 조정`은 같은 날 `Reply·Repost의 실제 획 높이를 count와 맞춘다`로 대체했다.
- 2026-07-23 `Reply·Repost의 실제 획 높이를 count와 맞춘다`는 2026-07-29 `Figma 기반 28px geometry로 Action Bar를 정규화한다`로 대체했다.
- 2026-07-29 `목록 Post 카드의 Action Bar 주변 spacing을 Figma에 맞춘다`는 같은 날 `Quote preview 내부·외부 spacing을 분리한다`로 Quote spacing이 대체됐다. Action Bar 하단 4px, 1px semantic divider와 순수 Repost spacing 결과는 유지한다.
- 2026-07-21 `실행할 수 없는 액션은 숨기지 않고 disabled로 유지`는 2026-07-27 `production surface는 표시 Post와 action target을 구분한다`로 대체했다.
