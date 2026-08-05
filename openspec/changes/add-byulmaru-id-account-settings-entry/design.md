## Context

`PROD-653`이 완료한 정보 구조와 `docs/design/settings.md`는 `/settings`에서 Byulmaru ID Account Settings를
외부 진입점으로 구분한다. 이 change는 `PROD-645`가 소유하는 독립 Account 행 child를 제공하고,
`PROD-685`가 production route/navigation에서 `PROD-645`·`PROD-667` child를 조립할 수 있는 계약을 만든다.
Web·Android·iOS는 같은 React Native component tree를 사용하며, Expo Router `Link`가 external URL과
브라우저·OS navigation 경계를 소유한다.

## Goals / Non-Goals

**Goals:**

- 시각 label `계정 설정`, Byulmaru ID 외부 Account Settings accessible name, canonical URL을 하나의 평면
  행에 제공한다.
- 모든 플랫폼에서 실제 Expo Router external `Link`와 link semantics를 사용하고, 행의 chevron·target geometry·
  focus-visible styling을 유지한다.
- `PROD-685`가 별도 slot API나 플랫폼 분기 없이 concrete child를 `/settings`에 조립할 수 있게 한다.

**Non-Goals:**

- `/settings` production route, page heading, Profile child, shell navigation 또는 page-level 통합
- URL 지원 확인, navigation 성공·실패, loading·error·retry·lock 상태와 그 복구
- Kosmo Account 데이터 query·form·save와 내부 Account route
- Byulmaru ID 화면 또는 인증·OAuth/session 계약 변경
- `PROD-684`의 최종 Settings 통합, OpenSpec 완료·archive 판단

## Implementation Guidance

### Current Constraints

- `PROD-653`은 완료된 선행 정보 구조 산출물이다. 이 change와 `PROD-645`는 production route나 page shell을
  다시 만들지 않는다.
- 외부 navigation을 component의 JS action으로 대체하지 않고 Expo Router의 실제 external `Link`를 사용한다.
- 브라우저 또는 OS가 navigation lifecycle과 결과를 소유하므로 Kosmo 코드에 `Platform`, `Linking`,
  `useRef`, `canOpenURL`, `openURL`, loading/error/retry/lock helper를 두지 않는다. focus-visible 표시를 위한
  local `useState`와 `onFocus`/`onBlur`는 허용하되 navigation 상태와 섞지 않는다.

### Recommended Approach

- `BYULMARU_ID_ACCOUNT_SETTINGS_URL = 'https://id.byulmaru.co'`를 canonical constant로 유지한다.
- 시각 label은 `계정 설정`, accessible name은 `Byulmaru ID Account Settings 외부 서비스로 이동`으로 둔다.
- 다음 shape만 유지한다.

  ```tsx
  <Link asChild href={BYULMARU_ID_ACCOUNT_SETTINGS_URL}>
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Byulmaru ID Account Settings 외부 서비스로 이동"
    >
      <Text>계정 설정</Text>
      <ChevronRightIcon accessibilityElementsHidden pointerEvents="none" />
    </Pressable>
  </Link>
  ```

- row에는 JS `onPress`를 두지 않는다. Web에서는 실제 anchor의 browser 기본 동작(새 탭, modifier, 주소 복사
  등)을, Android·iOS에서는 Expo Router와 OS의 external link flow를 그대로 사용한다.
- focus-visible 표시를 위한 local focus state로 plain static style object를 구성해 `Link` Slot 병합 뒤에도
  target geometry와 outline을 유지한다. style callback은 사용하지 않으며, chevron은 별도 focus target이나
  action이 아닌 장식 요소로 둔다.
- component unit test는 시각 label, accessible label, link role, exact href, chevron, focus-visible style과 JS
  `onPress` 부재·정적 상태만 검증한다. Linking/error/retry/modifier/lock mocks와 상태 machine test는 두지 않는다.
- Storybook은 기본 실제 링크 한 상태만 catalog한다. visible label, accessible external link, canonical href와
  focus 가능성을 확인하되 click/Enter를 발생시켜 외부 navigation을 실행하지 않는다.

### Known Traps

- absolute canonical URL 대신 Expo Router 내부 route나 SPA fallback을 사용하지 않는다.
- `Pressable`에 `onPress`를 추가해 실제 link를 JS-only action으로 만들지 않는다.
- `Platform`, `Linking`, `window` 또는 browser/OS support check를 공용 component에 import하지 않는다.
- visible label에 Byulmaru ID를 반복해 owner copy를 중복하지 않되, accessible name과 destination에서는 외부
  Account Settings 소유권이 식별되어야 한다.
- chevron을 별도 focus target으로 만들거나, link에 disabled/busy/lock state를 추가하지 않는다.

## Risks / Trade-offs

- [provider가 root URL 이후 destination을 결정한다] → Kosmo는 승인된 canonical origin만 href로 사용하고 provider
  인증·redirect 결과를 추론하지 않는다.
- [이 branch만으로 production `/settings`에 노출되지 않는다] → `PROD-685`가 route/navigation과
  `PROD-645`·`PROD-667` child 조립 및 page-level 검증을 소유한다.
- [전체 Settings 완료 여부가 child PR만으로 결정되지 않는다] → `PROD-684`가 최종 통합 및 OpenSpec
  완료/archive 판단을 소유한다.

## Migration Plan

1. production route나 navigation을 노출하지 않은 채 concrete child, 정적 unit test와 기본 Storybook catalog를
   전달한다.
2. `PROD-685`가 `PROD-645`·`PROD-667` child를 production `/settings` route에 조립하고 page-level 검증을
   수행한다.
3. `PROD-684`가 최종 Settings 통합과 전체 OpenSpec 완료 증거를 확인한 뒤 archive를 판단한다.

## Open Questions

없음.
