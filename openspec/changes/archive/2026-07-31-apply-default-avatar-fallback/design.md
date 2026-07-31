## Context

공용 `Avatar` primitive는 `imageUri`가 있으면 원격 이미지를, 없으면 `label`의 첫 글자를 `Text`로 표시한다.
현재 원형 clipping, 크기 조절과 접근성 역할·이름은 primitive root에 집중되어 있으므로 fallback 표현만 바꾸면
공용 소비 화면에 같은 결과를 제공할 수 있다. 승인된 디자인 원본은 Figma `Default Avatar` 노드(1552:667)의
1024×1024 전체 프레임이다.

## Goals / Non-Goals

**Goals:**

- 이미지 URL 부재 상태를 승인된 기본 아바타 이미지로 일관되게 표시한다.
- 실제 이미지 URL 우선순위와 기존 원형 clipping·크기·접근성 계약을 유지한다.
- Expo Native와 Web이 이미 지원하는 정적 PNG asset 경로를 사용한다.

**Non-Goals:**

- 실제 프로필 이미지 URL 연결, 업로드·삭제 또는 네트워크 이미지 로드 실패 정책을 변경하지 않는다.
- 소비 화면마다 별도 fallback 로직을 추가하지 않는다.
- SVG module transformer나 새 이미지 dependency를 도입하지 않는다.

## Implementation Guidance

### Current Constraints

- `Avatar`의 URL 부재 분기는 이니셜 `Text`를 직접 렌더하며, 실제 URL을 받는 현재 소비자는 같은 primitive를
  사용한다.
- 앱은 로컬 PNG를 TypeScript default import 후 React Native `Image` source로 사용하는 관례가 있다.
- SVG 파일 직접 import를 위한 type declaration, Metro transformer와 테스트 변환 설정은 없다.
- 기존 ProfileHero 단위 테스트는 URL이 없으면 `Image`가 하나도 없다는 이전 계약을 고정한다.
- `web-app-shell`의 같은 Profile requirement를 복제한 active delta가 있어 archive 시 fallback 문구를 최신
  canonical 계약과 다시 대조해야 한다.

### Recommended Approach

Figma 전체 노드에서 export한 단일 1024×1024 PNG를 앱의 정적 avatar asset으로 추가한다. `Avatar`는
`imageUri`가 있으면 기존 URI source를, 없으면 로컬 기본 asset을 선택해 같은 `Image`와 `cover` 스타일로
렌더링한다. root의 원형 clipping·border·크기와 접근성 이름은 유지하고 내부 `Image`는 계속 접근성 트리에서
제외한다.

근접 Storybook catalog에서 작은 크기를 포함한 canonical size와 라이트·다크 주변 배경을 확인한다. 기존
ProfileHero 테스트는 URL 부재 시 로컬 기본 asset을, URL 존재 시 원격 URI가 우선함을 관찰 가능한 결과로
검증한다.

### Allowed Alternatives

없음. 단일 1024×1024 PNG 사용은 승인된 디자인 결정이다.

### Known Traps

- 내부 SVG만 추출하면 Figma 프레임의 배경과 crop을 잃으므로 전체 노드 PNG와 시각 결과가 달라진다.
- 소비 화면별로 기본 이미지를 전달하면 공용 fallback이 분산되고 새 소비자가 누락될 수 있다.
- `onError`에서 기본 이미지로 교체하면 명시적으로 제외된 네트워크 실패 정책을 변경한다.
- 기본 이미지에 별도 접근성 이름을 부여하면 root의 기존 프로필 이름과 중복 낭독될 수 있다.

## Risks / Trade-offs

- [1024×1024 PNG를 작은 크기로 축소한다] → 정방형 원본과 `cover`를 유지하고 24px부터 Storybook에서 식별성과
  clipping을 확인한다.
- [active OpenSpec delta가 이전 이니셜 문구를 다시 반영할 수 있다] → 이 change archive 직전에 관련 active
  delta와 canonical base를 다시 대조하고 최종 계약을 동기화한다.
- [자동화만으로 Native 실제 렌더링을 완전히 증명할 수 없다] → Web Storybook 검증과 별도로 iOS·Android
  runtime QA의 실행 여부를 명시한다.

## Migration Plan

정적 asset과 primitive fallback을 같은 구현 slice로 배포한다. 데이터 migration과 단계적 rollout은 없다.
회귀 시 코드와 asset을 함께 되돌리고 URL 부재 fallback을 이전 이니셜 렌더링으로 복구한다.

## Open Questions

없음.
