## Context

이 기록은 PROD-852가 준비한 공용 navigation chrome을 PROD-796에서 Production에 연결하기 위해 정렬한 canonical 디자인 문서, Linear 계약과 현재 shell·검색 route 구조를 반영한다.

## Decision Records

### Web Home 진입점은 현재 Home 또는 Local 타임라인을 재선택한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/local-timeline.md`, `docs/design/page-header.md`, `PROD-796`
- Status: Active
- Context / Problem: Home과 Local은 공통 navigation에서 하나의 active Home 항목을 사용하지만 기존 shell callback은 `/home`만 재선택하고 `/local`에서는 `/home`으로 이동한다.
- Decision Outcome: Web의 active Home 항목과 compact·full 브랜드 마크의 일반 활성화는 route를 바꾸지 않고 현재 Home 또는 Local을 document 최상단으로 이동한 뒤 해당 Relay boundary를 다시 요청한다. 실제 link href는 `/home`으로 유지한다.
- Alternatives Considered: Local에서 항상 `/home`으로 이동하는 기존 동작은 같은 active 화면군을 재선택한다는 계약과 맞지 않아 제외했다. href를 `/local`로 바꾸는 방식은 canonical Home link와 modifier·새 탭 의미를 깨므로 제외했다.
- Consequences: 실제 href와 일반 활성화 결과가 `/local`에서 다르며, modifier·새 탭에는 재선택 callback을 실행하지 않아야 한다. Home과 Local이 각자 동일한 shell callback lifecycle을 등록해야 한다.
- Confirmation / Follow-up: `/home`·`/local` 일반 활성화, 진행 중 중복 요청, 실패 후 재시도와 modifier·새 탭을 실행 기반 test로 확인한다.

### 모바일 브랜드 마크는 비상호작용 요소로 유지한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/page-header.md`, `PROD-796`
- Status: Active
- Context / Problem: Web timeline 재선택을 모든 header에 확장하면 mobile Web과 Android/iOS에 새 navigation·scroll 계약이 생긴다.
- Decision Outcome: compact·full Web 브랜드 마크만 Home link와 현재 timeline 재선택을 제공하고 mobile Web·Android·iOS 브랜드 마크는 기존 geometry의 비상호작용 요소로 유지한다.
- Alternatives Considered: 모든 플랫폼 브랜드 마크 활성화는 Native 목록 scroll과 header 접근성 계약까지 넓어져 PROD-796 범위를 넘으므로 제외했다.
- Consequences: 모바일 사용자는 기존 하단 navigation으로 이동하며 브랜드 마크에는 href, press handler나 interactive role을 제공하지 않는다.
- Confirmation / Follow-up: mobile Web·Android·iOS header가 브랜드 마크를 control로 노출하지 않는지 확인한다. Native 실제 기기 QA는 별도 미검증으로 보고한다.

### 공용 presentation과 Production navigation lifecycle을 adapter에서 합성한다

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/icons.md`, `docs/design/accessibility.md`, `PROD-796`
- Status: Active
- Context / Problem: 공용 UI의 callback만 사용해 `router.navigate()`를 호출하면 기존 Expo Router link, modifier·새 탭, navigation guard와 primary scroll 기록이 사라지고, 반대로 router·Relay를 공용 UI에 넣으면 Storybook presentation 경계가 무너진다.
- Decision Outcome: 기존 shell 파일은 pathname·Relay·safe area·drawer를 소유하는 adapter로 유지한다. 공용 UI에는 실제 소비자가 필요한 좁은 render seam만 추가하고 adapter가 canonical visual control을 기존 `NavigationLink`로 감싼다.
- Alternatives Considered: 공용 UI에서 router·Relay를 직접 사용하거나 adapter가 visual markup을 다시 만드는 방식은 계층 책임 또는 단일 visual source를 깨므로 제외했다. callback-only navigation은 Web link 의미를 보존하지 못해 제외했다.
- Consequences: 공용 UI API에 현재 Production 소비용 seam이 하나 추가되지만 기본 Storybook 사용은 그대로다. Sidebar의 ProfileSwitcher·scroll owner와 UniversalShell의 drawer lifecycle은 이동하지 않는다.
- Confirmation / Follow-up: component story와 Production shell test에서 role·current·disabled, guard 승인·취소, modifier·새 탭과 drawer close를 확인한다.

### 로그아웃은 기존 action과 guard를 재사용하고 visual 상태만 공용 Sidebar에 전달한다

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/foundations.md`, `docs/design/accessibility.md`, `PROD-475`, `PROD-796`
- Status: Active
- Context / Problem: 공용 Sidebar의 현재 `onLogout`만 연결하면 `useLogout`의 server 안전성은 유지할 수 있어도 사용자가 보는 disabled·busy·failure alert·retry 상태를 표현할 수 없다.
- Decision Outcome: Production Sidebar adapter가 기존 `useLogout`과 navigation guard를 그대로 사용하고 pending·error를 공용 Sidebar presentation에 전달한다. 별도 controller 계층은 만들지 않으며 중복 visual `LogoutControl`은 다른 소비자가 없으면 제거한다.
- Alternatives Considered: callback만 연결해 UI 상태를 제거하는 방식은 기존 logout 접근성 계약을 회귀시켜 제외했다. 새 logout controller abstraction은 단일 소비자에 불필요해 제외했다.
- Consequences: 공용 Sidebar props에는 현재 필요한 logout pending·error 상태만 추가된다. 실패 시 credential과 현재 화면은 유지되고 같은 control로 재시도한다.
- Confirmation / Follow-up: pending 중 중복 방지·busy 전달과 실패 alert·재활성화를 실행 기반 test로 확인한다.

## Remaining Decisions

- 없음.

## full·drawer 행 확장과 Profile Avatar 정렬

- Decision Date: 2026-09-12
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`의 2026-09-12 사용자 승인과 후속 Figma 정본 동기화·문서화·commit/push 승인, `PROD-796`의 공용 navigation geometry 범위
- Status: Active
- Context / Problem: 프로필과 메뉴 배경은 `24px`에 정렬되어도 메뉴 아이콘은 내부 여백 때문에 `32px`에서 시작해 상단보다 안쪽으로 보인다.
- Decision Outcome: full·drawer의 바깥 좌우 여백을 `16px`로 줄이고 내부 `8px`를 유지한다. 프로필 요약과 leading icon slot의 시작점은 `24px`로 일치하며 행은 좌우로 `8px`씩 넓어진다. 후속 사용자 정렬 요청에 따라 navigation의 `28px` Profile Avatar는 `20px` slot 중앙에 배치해 다른 아이콘과 가로 중심선 및 label 시작점을 맞춘다.
- Alternatives Considered: 기존 `24px` 바깥 여백 유지, 행을 sidebar 끝까지 채우는 안. 사용자는 둥근 선택 배경 바깥에 `16px` 여백을 남기는 안의 로컬 구현을 승인했다.
- Consequences: 높이·radius·내부 icon 간격·nested inset·compact 간격·picker·navigation lifecycle은 유지한다. Figma의 공용 행·primary·utility source 폭과 SidebarNavigation 변형을 동기화했고, 기존 Avatar source를 재사용했다. 새 토큰·공개 prop·component set은 추가하지 않았다. Linear의 기존 기록은 이번에 수정하지 않았으며, commit/push 승인은 merge·배포 승인을 뜻하지 않는다.
- Confirmation / Follow-up: 로컬 공용 UI와 Production full·drawer에서 배경 `16px`, leading slot `24px`, 좁은 drawer와 기존 focus·disclosure를 검증했다. Figma 51개 변형의 정렬과 Available 27개 Avatar 크기, 기존 Light/Dark 소비처의 상속을 확인했다. Native 실제 runtime과 Figma Unavailable의 기존 interaction 모델 정렬은 이번 geometry 범위 밖이다.

## Superseded Decisions

- 없음.
