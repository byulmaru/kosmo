## Context

`apps/app`은 Android·iOS·Web을 공유하는 React Native 애플리케이션이며, 게시글 목록과 상세는 현재 작성자·시간·본문을 렌더하지만 공통 Post Action Bar나 이를 위한 Relay fragment는 없다. UI theme에는 `textSecondary`, `primary`, `danger`, spacing·typography token과 compact/full breakpoint가 있고 `lucide-react-native`가 이미 설치되어 있다. 기존 공용 `Button`은 일반 텍스트 버튼에 맞춘 최소 높이 40px 계약이어서, 16px icon/count 표현과 최소 44×44 interactive target을 함께 요구하는 Action Bar control에 그대로 사용하기 어렵다.

[KOSMO Action 컴포넌트](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=88-1005)는 Reply → Repost → Reaction → Bookmark → More 순서, 16px icon/count, 4px 내부 간격, 약 50px 액션 영역과 보조 텍스트 색상을 보여 준다. 다만 현재 Figma에는 pending·disabled·error와 44×44 interactive target이 없다. Figma는 이 change에서 수정하지 않으며 비규범적 시각 참고로만 사용한다. `docs/domain`·`docs/design`은 제품·디자인의 canonical source, Linear는 범위·소유권·의존성의 source, `post-action-bar` spec은 상태·입력·접근성·통합 동작의 규범 계약이다.

공유 change의 계약 부모는 PROD-432다. PROD-433은 독립 UI와 상태 카탈로그를, PROD-434는 production surface 배치를, PROD-432는 준비된 실제 action 상태 연결·More 링크 복사·최종 통합 검증·archive를 소유한다. Reply·Repost·Reaction·Bookmark 자체의 저장·GraphQL·count 집계·selected 의미·권한·Post Kind·Post Visibility 정책은 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425와 canonical 문서의 계약을 재사용한다.

## Goals / Non-Goals

**Goals:**

- 하나의 고정된 공개 `PostActionBar` API로 다섯 액션의 순서, optional 표시, 상태와 callback 경계를 제공한다.
- selected와 처리 상태를 독립적으로 모델링해 selected+pending을 손실 없이 표현한다.
- count를 K/M 단위의 최대 네 글자 표현으로 제한해 지원 폭에서 한 행 배치를 검증 가능하게 한다.
- 같은 React Native 구현이 native와 Web에서 최소 44×44 입력 영역과 접근성 metadata를 제공한다.
- UI, surface 배치, 실제 데이터 연결을 각 구현 이슈가 독립적으로 리뷰·검증할 수 있게 하면서 하나의 공유 spec으로 최종 결과를 묶는다.

**Non-Goals:**

- Action Bar 내부에서 Relay fragment, mutation, navigation, cache 정책 또는 Post Kind 정책을 소유하는 것
- `PostActionBar` 컴포넌트가 More 팝업·clipboard·메뉴 상태를 직접 소유하는 것
- 링크 복사 외의 More 메뉴 항목이나 guest 인증 목적지·임시 인증 화면을 구현하는 것
- 액션을 임의 배열로 조립하는 범용 toolbar API나 공개 action leaf 컴포넌트를 제공하는 것
- 기존 개별 action 계약을 재정의하거나 Figma 파일을 동기화하는 것

## Implementation Guidance

### Current Constraints

- 게시글 렌더 경로는 route → `PostLayout`/`PostList` → `PostListItem`이며, Action Bar를 넣을 기존 slot이나 fragment가 없다. PROD-433에서 이 surface들을 먼저 수정하면 PROD-434의 소유권과 검증 경계를 침범한다.
- `Button`의 40px 일반 버튼 metric과 loading/disabled 표현은 Action Bar의 16px icon/count, 44px target, selected+pending 조합에 맞지 않는다.
- React Native Web을 공유하므로 DOM element, CSS selector, Web 전용 event에 의존한 구현은 native 계약을 깨뜨린다.
- Figma의 시각 행 높이 약 27~28px는 interactive target 요구사항보다 작다. 보이는 glyph metric은 유지하되 control layout 자체가 44px 이상이어야 한다.
- 실제 count와 viewer-relative selected 상태의 cache 소유권은 Action Bar가 아니라 상위 Relay/surface 계층에 있다.

### Recommended Approach

PROD-433에서는 `apps/app/src/components/post`에 공개 `PostActionBar` 하나를 추가하고, 반복되는 Pressable·icon·count·spinner·접근성 처리는 같은 모듈의 비공개 control로 캡슐화한다. 공개 props는 `reply`, `repost`, `reaction`, `bookmark`, `more`의 명시적 optional key로 고정한다. Reply·Repost·Reaction·Bookmark는 callback, 선택적 count, selected 여부와 default·pending·disabled·error 처리 상태를 받는다. More는 callback과 접근성 label만 소비하며 count·selected·처리 상태를 받지 않는다.

각 control은 최소 44×44 layout을 사용하고, 내부 glyph는 Figma의 16px icon/count와 4px 간격을 기준으로 배치한다. 행은 전체 사용 가능 폭을 사용하면서 고정 순서로 한 줄에 분배한다. count는 0~999 원문, K/M 단위, 10 미만 단위의 소수 한 자리, `.0` 생략, K→M 반올림 승격과 1,000M 도달 시 `999M` 상한 규칙으로 최대 네 글자를 유지한다. 색상·spacing·typography는 기존 theme token을 사용하고 icon은 기존 `lucide-react-native`에서 시각적으로 대응하는 glyph를 선택한다. pending은 icon 영역만 동일 크기의 spinner로 대체해 count와 행 배치가 흔들리지 않게 한다.

PROD-433의 Storybook은 기본, 선택, selected+pending, disabled, error, compact count 경계, count 없음, optional 액션, More callback-only, compact/mobile/web 폭을 각각 검토할 수 있게 한다. 상호작용 검증은 default·selected·error의 callback 호출, pending·disabled의 차단, More callback, keyboard/touch activation과 접근성 state를 확인한다. 이 단계에서는 `PostListItem`, `PostLayout`, route나 Relay 생성물을 수정하지 않는다.

PROD-434는 준비된 `PostActionBar`를 목록·상세의 게시글 콘텐츠 영역에 배치하고, 게시글 상세 navigation과 action Pressable이 중첩 활성화되지 않도록 현재 surface의 interactive layer 경계를 정리한다. production surface는 다섯 액션을 모두 제공하며, Post Kind·Post Visibility·권한상 실행할 수 없는 액션은 optional prop을 생략하지 않고 disabled 상태로 표현한다.

PROD-432는 선행 action 구현의 실제 fragment/mutation 결과를 surface adapter에서 `PostActionBar` 상태로 변환한다. viewer-independent count와 선택 Profile별 selected 상태의 기존 Relay cache 경계를 유지하고, action별 pending/error를 분리한다. guest의 Reply·Repost·Reaction·Bookmark activation은 인증 여부만으로 숨기거나 비활성화하지 않고 상위 인증 진입 계약으로 위임하되 이 change에서 임시 인증 화면이나 목적지를 만들지 않는다. More callback은 surface에서 접근 가능한 최소 팝업을 열고 guest도 사용할 수 있는 `링크 복사`로 canonical Post URL을 clipboard에 복사한다. 모든 자식과 선행 action이 준비된 뒤 목록·상세의 동일 계약, Profile 전환, 성공·실패·재시도, disabled 정책 및 More 링크 복사를 통합 검증하고 공유 change를 archive한다.

### Allowed Alternatives

- 비공개 control은 직접 `Pressable`을 사용하거나 기존 primitive를 조합할 수 있다. 어느 쪽이든 공개 leaf 컴포넌트를 추가하지 않고 specs의 입력·상태·44×44·접근성 계약을 충족해야 한다.
- spinner는 React Native `ActivityIndicator` 또는 이미 존재하는 동등한 theme-aware primitive를 사용할 수 있다. 외부 dependency는 추가하지 않는다.
- surface adapter의 정확한 fragment 배치는 각 선행 action 계약과 당시 코드 구조를 따를 수 있다. count와 selected의 cache 경계 및 action별 처리 상태는 바꾸지 않는다.

### Known Traps

- selected를 하나의 처리 상태 값으로 합치면 selected+pending을 표현할 수 없고 요청 중 선택 의미가 사라진다.
- `hitSlop`만 추가하고 실제 control layout을 44px 미만으로 두면 Web keyboard/pointer target과 layout 검증이 일치하지 않을 수 있다.
- Figma의 작은 시각 행 높이를 그대로 Pressable 높이로 복사하면 접근성 계약을 위반한다.
- 범용 `actions[]`나 공개 Reply/Repost leaf를 추가하면 고정 제품 계약보다 넓은 API와 불필요한 조합을 만든다.
- Action Bar 컴포넌트가 Relay, mutation, navigation, More 팝업 또는 Post 정책 분기를 소유하면 구현 이슈 간 책임이 다시 결합된다.
- pending 하나로 행 전체를 비활성화하면 독립 액션을 불필요하게 차단한다.

## Risks / Trade-offs

- [44px target 때문에 Figma의 27~28px 시각 행보다 실제 layout 높이가 커질 수 있음] → glyph 크기와 내부 시각 간격은 유지하고, Storybook에서 게시글 카드 전체 리듬과 interactive target을 함께 검토한다.
- [native와 Web의 접근성 state 지원 차이] → 공통 `accessibilityRole`·`accessibilityLabel`·`accessibilityState`를 우선하고 Storybook 상호작용 테스트와 각 플랫폼의 실제 보조 기술 점검을 분리한다.
- [count 반올림 경계가 플랫폼별로 달라질 수 있음] → K/M·소수 한 자리·단위 승격·`999M` 상한의 동일 fixture를 native와 Web component test에서 공유한다.
- [선행 action 이슈의 공개 결과가 달라질 수 있음] → Action Bar는 표시 상태와 callback만 소비하고, adapter는 PROD-432에서 선행 계약이 확정된 뒤 연결한다.
- [More 팝업 구현이 공통 컴포넌트에 결합될 수 있음] → PROD-433은 callback-only로 유지하고 PROD-432 surface 통합이 팝업과 clipboard를 소유한다.

## Migration Plan

1. PROD-433에서 surface와 분리된 공통 컴포넌트, Storybook 및 component test를 추가한다.
2. PROD-434에서 지원되는 목록·상세 surface에 공통 컴포넌트를 배치하되 실제 action state 연결 전에는 상위 계층이 제공하는 계약만 소비한다.
3. 선행 action 구현이 준비되면 PROD-432에서 실제 Relay 상태와 callback, disabled 정책, guest 인증 위임과 More 링크 복사를 연결하고 통합 검증한다.
4. 모든 task와 통합 검증이 완료된 뒤 PROD-432가 change를 archive하고 archive 후 strict validation을 수행한다.

롤백은 역순으로 production surface 연결을 제거한 뒤 공통 컴포넌트를 제거한다. 새 persistence나 schema migration이 없으므로 데이터 rollback은 필요 없다. 일부 구현 PR만 완료된 동안에는 change를 archive하지 않는다.

## Open Questions

없음.
